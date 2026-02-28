import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, extname } from 'path'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Supported file types
type FileType = 'tar' | 'tar.gz' | 'zip' | 'rar' | 'unknown'

// Global state for extraction status
let extractionStatus = {
  status: 'idle' as 'idle' | 'extracting' | 'success' | 'error',
  message: '',
  progress: 0,
  files: [] as Array<{ path: string; size: number; type: 'file' | 'directory' }>,
  totalFiles: 0,
  error: '',
  fileType: '',
  extractedFilePath: ''
}

// Detect file type from filename
function detectFileType(filename: string): FileType {
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) return 'tar.gz'
  if (lowerName.endsWith('.tar')) return 'tar'
  if (lowerName.endsWith('.zip')) return 'zip'
  if (lowerName.endsWith('.rar')) return 'rar'
  return 'unknown'
}

// Extract archive based on type
async function extractArchive(
  filePath: string, 
  targetDir: string, 
  fileType: FileType
): Promise<{ success: boolean; items: string[]; error?: string }> {
  try {
    let command: string
    let extractedItems: string[] = []

    switch (fileType) {
      case 'tar':
        console.log('Extracting TAR file...')
        command = `tar -xvf "${filePath}" -C "${targetDir}" 2>&1`
        break
      
      case 'tar.gz':
        console.log('Extracting TAR.GZ file...')
        command = `tar -xzvf "${filePath}" -C "${targetDir}" 2>&1`
        break
      
      case 'zip':
        console.log('Extracting ZIP file...')
        command = `unzip -o "${filePath}" -d "${targetDir}" 2>&1`
        break
      
      case 'rar':
        console.log('Extracting RAR file...')
        command = `unrar x -o+ "${filePath}" "${targetDir}/" 2>&1`
        break
      
      default:
        return { success: false, items: [], error: 'نوع ملف غير مدعوم' }
    }

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large output
      timeout: 300000 // 5 minutes timeout
    })

    // Parse output to get extracted items
    const output = stdout + stderr
    
    if (fileType === 'zip') {
      // unzip output format: "  inflating: filename"
      extractedItems = output.split('\n')
        .filter(line => line.includes('inflating:') || line.includes('creating:'))
        .map(line => {
          const match = line.match(/(?:inflating:|creating:)\s*(.+)/)
          return match ? match[1].trim() : ''
        })
        .filter(item => item)
    } else if (fileType === 'rar') {
      // unrar output format: "Extracting  filename"
      extractedItems = output.split('\n')
        .filter(line => line.includes('Extracting') || line.includes('Creating'))
        .map(line => {
          const match = line.match(/(?:Extracting|Creating)\s+(.+)/)
          return match ? match[1].trim() : ''
        })
        .filter(item => item)
    } else {
      // tar output: each line is a filename
      extractedItems = output.split('\n').filter(f => f.trim())
    }

    console.log(`Extracted ${extractedItems.length} items from ${fileType} archive`)
    
    return { success: true, items: extractedItems }
  } catch (error) {
    console.error(`Extraction error for ${fileType}:`, error)
    return { 
      success: false, 
      items: [], 
      error: error instanceof Error ? error.message : 'خطأ في استخراج الملف' 
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('Starting upload process...')
    
    // Get the content length to check file size
    const contentLength = request.headers.get('content-length')
    const fileSizeMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : 'unknown'
    console.log(`Incoming file size: ${fileSizeMB} MB`)

    // Reset status
    extractionStatus = {
      status: 'extracting',
      message: 'جاري قراءة الملف...',
      progress: 5,
      files: [],
      totalFiles: 0,
      error: '',
      fileType: '',
      extractedFilePath: ''
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      console.log('No file found in form data')
      return NextResponse.json({ error: 'لم يتم العثور على ملف' }, { status: 400 })
    }

    // Detect file type
    const fileType = detectFileType(file.name)
    if (fileType === 'unknown') {
      return NextResponse.json({ 
        error: 'صيغة الملف غير مدعومة. الصيغ المدعومة: .tar, .tar.gz, .zip, .rar' 
      }, { status: 400 })
    }

    console.log(`File received: ${file.name}, size: ${(file.size / (1024 * 1024)).toFixed(2)} MB, type: ${fileType}`)

    extractionStatus.fileType = fileType
    extractionStatus.message = `جاري حفظ الملف (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`
    extractionStatus.progress = 10

    // Create temp directory
    const tempDir = join(tmpdir(), `upload-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    
    // Determine temp file extension
    let tempExt = '.tar'
    if (fileType === 'tar.gz') tempExt = '.tar.gz'
    else if (fileType === 'zip') tempExt = '.zip'
    else if (fileType === 'rar') tempExt = '.rar'
    
    const tempFilePath = join(tempDir, `upload${tempExt}`)
    
    // Stream file to disk for large files
    extractionStatus.message = 'جاري كتابة الملف على القرص...'
    extractionStatus.progress = 15
    
    // Use arrayBuffer for smaller files, stream for larger ones
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    await writeFile(tempFilePath, buffer)
    console.log(`File saved to: ${tempFilePath}, took ${Date.now() - startTime}ms`)

    extractionStatus.message = `جاري استخراج الملف من ${fileType.toUpperCase()}...`
    extractionStatus.progress = 25

    // Create extraction directory
    const projectRoot = process.cwd()
    const extractedDir = join(projectRoot, 'extracted-system')
    
    // Clean up previous extraction
    if (existsSync(extractedDir)) {
      console.log('Cleaning up previous extraction...')
      await rm(extractedDir, { recursive: true, force: true })
    }
    await mkdir(extractedDir, { recursive: true })
    console.log(`Extraction directory created: ${extractedDir}`)

    // Extract archive based on type
    extractionStatus.message = 'جاري فك ضغط ملفات النظام...'
    extractionStatus.progress = 35

    const extractionResult = await extractArchive(tempFilePath, extractedDir, fileType)
    
    if (!extractionResult.success) {
      extractionStatus.status = 'error'
      extractionStatus.error = extractionResult.error || 'خطأ في استخراج الملف'
      return NextResponse.json({ 
        status: 'error', 
        error: extractionStatus.error 
      }, { status: 500 })
    }

    if (extractionResult.items.length === 0) {
      extractionStatus.status = 'error'
      extractionStatus.error = 'لم يتم العثور على ملفات داخل الأرشيف'
      return NextResponse.json({ 
        status: 'error', 
        error: extractionStatus.error 
      }, { status: 500 })
    }

    extractionStatus.progress = 55
    extractionStatus.message = `تم العثور على ${extractionResult.items.length} عنصر`

    // List all extracted files
    extractionStatus.message = 'جاري قراءة قائمة الملفات...'
    extractionStatus.progress = 65

    console.log('Reading file list...')
    const { stdout: allFilesOutput } = await execAsync(`find "${extractedDir}" -type f 2>/dev/null | head -n 1000`)
    const files = allFilesOutput.split('\n').filter(f => f.trim())
    
    const { stdout: allDirsOutput } = await execAsync(`find "${extractedDir}" -type d 2>/dev/null | head -n 500`)
    const dirs = allDirsOutput.split('\n').filter(d => d.trim())

    console.log(`Found ${files.length} files and ${dirs.length} directories`)

    // Get total count
    const { stdout: countOutput } = await execAsync(`find "${extractedDir}" -type f 2>/dev/null | wc -l`)
    const totalFiles = parseInt(countOutput.trim()) || files.length

    // Build file list
    const fileList: Array<{ path: string; size: number; type: 'file' | 'directory' }> = []
    
    // Add directories
    for (const dir of dirs.slice(0, 100)) {
      const relativePath = dir.replace(extractedDir, '').replace(/^\//, '')
      if (relativePath) {
        fileList.push({
          path: relativePath,
          size: 0,
          type: 'directory'
        })
      }
    }

    // Add files with sizes
    for (const file of files.slice(0, 500)) {
      const relativePath = file.replace(extractedDir, '').replace(/^\//, '')
      if (relativePath) {
        try {
          const fileStat = await stat(file)
          fileList.push({
            path: relativePath,
            size: fileStat.size,
            type: 'file'
          })
        } catch {
          fileList.push({
            path: relativePath,
            size: 0,
            type: 'file'
          })
        }
      }
    }

    extractionStatus.files = fileList
    extractionStatus.totalFiles = totalFiles
    extractionStatus.status = 'success'
    extractionStatus.message = 'تم استخراج الملفات بنجاح!'
    extractionStatus.progress = 100

    // Clean up temp file
    try {
      await rm(tempDir, { recursive: true, force: true })
      console.log('Temp files cleaned up')
    } catch {
      // Ignore cleanup errors
    }

    console.log(`Upload and extraction completed in ${Date.now() - startTime}ms`)

    return NextResponse.json({
      status: 'success',
      message: 'تم استخراج ملفات النظام بنجاح',
      files: fileList,
      totalFiles: totalFiles,
      fileType: fileType,
      extractedPath: extractedDir
    })

  } catch (error) {
    console.error('Upload error:', error)
    extractionStatus.status = 'error'
    extractionStatus.error = error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
    
    return NextResponse.json({ 
      status: 'error', 
      error: extractionStatus.error 
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(extractionStatus)
}
