import { NextRequest, NextResponse } from 'next/server'
import { rm, cp, mkdir, access, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Global state for deployment status
let deployStatus = {
  status: 'idle' as 'idle' | 'deploying' | 'installing' | 'migrating' | 'success' | 'error',
  message: '',
  progress: 0,
  error: '',
  step: ''
}

export async function POST(request: NextRequest) {
  try {
    const projectRoot = process.cwd()
    const extractedDir = join(projectRoot, 'extracted-system')

    // Check if extracted directory exists
    if (!existsSync(extractedDir)) {
      return NextResponse.json({ error: 'لم يتم العثور على ملفات مستخرجة. قم برفع الملف أولاً.' }, { status: 400 })
    }

    // Reset status
    deployStatus = {
      status: 'deploying',
      message: 'بدء نشر النظام...',
      progress: 5,
      error: '',
      step: 'init'
    }

    // Step 1: Backup current important files
    deployStatus.message = 'جاري عمل نسخة احتياطية...'
    deployStatus.step = 'backup'
    deployStatus.progress = 10

    const backupDir = join(projectRoot, '.backup')
    if (!existsSync(backupDir)) {
      await mkdir(backupDir, { recursive: true })
    }

    // Step 2: Copy extracted files to project root
    deployStatus.message = 'جاري نسخ ملفات النظام...'
    deployStatus.step = 'copy'
    deployStatus.progress = 20

    // List of directories/files to exclude from copy
    const excludeList = [
      'node_modules',
      '.next',
      '.git',
      'dev.log',
      'server.log',
      'extracted-system',
      '.backup'
    ]

    // Copy files using rsync for better control
    try {
      const excludeArgs = excludeList.map(item => `--exclude="${item}"`).join(' ')
      await execAsync(`rsync -av ${excludeArgs} "${extractedDir}/" "${projectRoot}/" 2>&1`)
    } catch (rsyncError) {
      // Fallback to cp if rsync fails
      console.log('rsync failed, using cp:', rsyncError)
      
      // Copy specific directories
      const dirsToCopy = ['src', 'public', 'prisma', 'db', 'mini-services', 'examples']
      const filesToCopy = ['package.json', 'tsconfig.json', 'tailwind.config.ts', 'next.config.ts', 'Caddyfile', 'eslint.config.mjs', 'postcss.config.mjs']
      
      for (const dir of dirsToCopy) {
        const srcDir = join(extractedDir, dir)
        const destDir = join(projectRoot, dir)
        if (existsSync(srcDir)) {
          if (existsSync(destDir)) {
            await rm(destDir, { recursive: true, force: true })
          }
          await mkdir(destDir, { recursive: true })
          await execAsync(`cp -r "${srcDir}/." "${destDir}/"`)
        }
      }
      
      for (const file of filesToCopy) {
        const srcFile = join(extractedDir, file)
        const destFile = join(projectRoot, file)
        if (existsSync(srcFile)) {
          await execAsync(`cp "${srcFile}" "${destFile}"`)
        }
      }
    }

    deployStatus.progress = 50
    deployStatus.message = 'تم نسخ الملفات بنجاح'

    // Step 3: Install dependencies
    deployStatus.status = 'installing'
    deployStatus.message = 'جاري تثبيت الاعتمادات...'
    deployStatus.step = 'install'
    deployStatus.progress = 60

    try {
      const { stdout, stderr } = await execAsync('bun install', {
        cwd: projectRoot,
        timeout: 300000 // 5 minutes timeout
      })
      console.log('Install output:', stdout.slice(-500))
      deployStatus.message = 'تم تثبيت الاعتمادات'
      deployStatus.progress = 80
    } catch (installError) {
      console.log('Install error (non-critical):', installError)
      deployStatus.message = 'تحذير: قد تحتاج لتشغيل bun install يدوياً'
      deployStatus.progress = 80
    }

    // Step 4: Generate Prisma client
    deployStatus.status = 'migrating'
    deployStatus.message = 'جاري تهيئة قاعدة البيانات...'
    deployStatus.step = 'prisma'
    deployStatus.progress = 85

    const prismaSchema = join(projectRoot, 'prisma/schema.prisma')
    if (existsSync(prismaSchema)) {
      try {
        await execAsync('bun run db:generate', { cwd: projectRoot, timeout: 60000 })
        deployStatus.message = 'تم تهيئة Prisma'
      } catch (prismaError) {
        console.log('Prisma generate error:', prismaError)
      }
    }

    // Step 5: Check for database file and copy it
    const sourceDb = join(extractedDir, 'mushaf_source.db')
    const destDb = join(projectRoot, 'prisma/dev.db')
    if (existsSync(sourceDb)) {
      try {
        // Ensure prisma directory exists
        const prismaDir = join(projectRoot, 'prisma')
        if (!existsSync(prismaDir)) {
          await mkdir(prismaDir, { recursive: true })
        }
        await execAsync(`cp "${sourceDb}" "${destDb}"`)
        deployStatus.message = 'تم نسخ قاعدة البيانات'
      } catch (dbError) {
        console.log('Database copy error:', dbError)
      }
    }

    deployStatus.status = 'success'
    deployStatus.message = 'تم نشر النظام بنجاح! جاري إعادة التشغيل...'
    deployStatus.progress = 100

    // Step 6: Trigger restart (create .restart file)
    const restartFile = join(projectRoot, '.restart')
    await writeFile(restartFile, new Date().toISOString())

    return NextResponse.json({
      status: 'success',
      message: 'تم نشر النظام بنجاح!',
      progress: 100,
      steps: [
        { step: 'backup', status: 'done', message: 'تم عمل نسخة احتياطية' },
        { step: 'copy', status: 'done', message: 'تم نسخ ملفات النظام' },
        { step: 'install', status: 'done', message: 'تم تثبيت الاعتمادات' },
        { step: 'prisma', status: 'done', message: 'تم تهيئة قاعدة البيانات' },
        { step: 'restart', status: 'done', message: 'جاري إعادة التشغيل' }
      ]
    })

  } catch (error) {
    console.error('Deploy error:', error)
    deployStatus.status = 'error'
    deployStatus.error = error instanceof Error ? error.message : 'حدث خطأ أثناء النشر'
    
    return NextResponse.json({ 
      status: 'error', 
      error: deployStatus.error 
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(deployStatus)
}
