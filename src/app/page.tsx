'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { 
  Upload, 
  FileArchive, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FolderOpen,
  HardDrive,
  FileCode,
  RefreshCw,
  Play,
  Rocket,
  CheckCircle
} from 'lucide-react'

// Supported file formats
const SUPPORTED_FORMATS = ['.tar', '.tar.gz', '.tgz', '.zip', '.rar']
const ACCEPT_STRING = '.tar,.tar.gz,.tgz,.zip,.rar,application/x-tar,application/gzip,application/zip,application/x-rar-compressed'

interface ExtractedFile {
  path: string
  size: number
  type: 'file' | 'directory'
}

interface UploadStatus {
  status: 'idle' | 'uploading' | 'extracting' | 'success' | 'error'
  message: string
  progress: number
  files?: ExtractedFile[]
  totalFiles?: number
  error?: string
  fileType?: string
}

interface DeployStatus {
  status: 'idle' | 'deploying' | 'installing' | 'migrating' | 'success' | 'error'
  message: string
  progress: number
  error?: string
}

export default function Home() {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    status: 'idle',
    message: '',
    progress: 0
  })
  const [deployStatus, setDeployStatus] = useState<DeployStatus>({
    status: 'idle',
    message: '',
    progress: 0
  })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [])

  // Check if file has a supported extension
  const isSupportedFile = (filename: string): boolean => {
    const lowerName = filename.toLowerCase()
    return SUPPORTED_FORMATS.some(format => lowerName.endsWith(format))
  }

  // Get file type from name
  const getFileType = (filename: string): string => {
    const lowerName = filename.toLowerCase()
    if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) return 'tar.gz'
    if (lowerName.endsWith('.tar')) return 'tar'
    if (lowerName.endsWith('.zip')) return 'zip'
    if (lowerName.endsWith('.rar')) return 'rar'
    return 'unknown'
  }

  const handleFileUpload = async (file: File) => {
    // Check if file is supported
    if (!isSupportedFile(file.name)) {
      setUploadStatus({
        status: 'error',
        message: `الملف يجب أن يكون بصيغة مدعومة: ${SUPPORTED_FORMATS.join(', ')}`,
        progress: 0
      })
      return
    }

    const fileType = getFileType(file.name)

    // Reset statuses
    setDeployStatus({ status: 'idle', message: '', progress: 0 })
    
    setUploadStatus({
      status: 'uploading',
      message: `جاري رفع الملف (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`,
      progress: 5,
      fileType
    })

    const formData = new FormData()
    formData.append('file', file)

    try {
      console.log('Starting upload for file:', file.name, 'size:', file.size, 'type:', fileType)
      
      const response = await fetch('/api/upload-system', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type, let the browser set it with boundary
      })

      console.log('Response status:', response.status)
      
      let result
      try {
        result = await response.json()
      } catch (jsonError) {
        console.error('Failed to parse response:', jsonError)
        const textResponse = await response.text()
        console.log('Raw response:', textResponse)
        throw new Error('فشل في قراءة الاستجابة من الخادم')
      }

      console.log('Response result:', result)

      if (!response.ok) {
        throw new Error(result.error || `خطأ من الخادم: ${response.status}`)
      }

      setUploadStatus({
        status: 'success',
        message: 'تم استخراج الملف بنجاح!',
        progress: 100,
        files: result.files,
        totalFiles: result.totalFiles,
        fileType: result.fileType
      })

    } catch (error) {
      console.error('Upload error:', error)
      setUploadStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
        progress: 0,
        error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
      })
    }
  }

  const handleDeploy = async () => {
    setDeployStatus({
      status: 'deploying',
      message: 'جاري نشر النظام...',
      progress: 10
    })

    try {
      const response = await fetch('/api/upload-system/deploy', {
        method: 'POST'
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'حدث خطأ أثناء النشر')
      }

      setDeployStatus({
        status: 'success',
        message: result.message || 'تم نشر النظام بنجاح!',
        progress: 100
      })

    } catch (error) {
      setDeployStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'حدث خطأ أثناء النشر',
        progress: 0
      })
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const resetUpload = () => {
    setUploadStatus({
      status: 'idle',
      message: '',
      progress: 0
    })
    setDeployStatus({
      status: 'idle',
      message: '',
      progress: 0
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isDeploying = deployStatus.status === 'deploying' || 
                      deployStatus.status === 'installing' || 
                      deployStatus.status === 'migrating'

  const showDeployButton = uploadStatus.status === 'success' && 
                           uploadStatus.files && 
                           uploadStatus.files.length > 0 &&
                           deployStatus.status !== 'success'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-4xl space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HardDrive className="w-10 h-10 text-emerald-400" />
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                مستورد ملفات النظام
              </h1>
            </div>
            <p className="text-slate-400 text-lg">
              قم برفع ملف مضغوط لاستخراج وتشغيل ملفات النظام
            </p>
          </div>

          {/* Upload Card */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileArchive className="w-5 h-5 text-emerald-400" />
                رفع ملف النظام
              </CardTitle>
              <CardDescription className="text-slate-400">
                اسحب وأفلت ملف أو انقر لاختيار الملف
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop Zone */}
              <div
                className={`
                  relative border-2 border-dashed rounded-xl p-8 md:p-12
                  transition-all duration-300 cursor-pointer
                  ${isDragging 
                    ? 'border-emerald-400 bg-emerald-400/10' 
                    : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'
                  }
                  ${uploadStatus.status !== 'idle' && uploadStatus.status !== 'error' ? 'pointer-events-none opacity-50' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_STRING}
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploadStatus.status !== 'idle' && uploadStatus.status !== 'error'}
                />
                
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className={`
                    p-4 rounded-full transition-all duration-300
                    ${isDragging ? 'bg-emerald-400/20' : 'bg-slate-700'}
                  `}>
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-emerald-400' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-white">
                      {isDragging ? 'أفلت الملف هنا' : 'اسحب ملفاً مضغوطاً هنا'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      أو انقر لاختيار الملف من جهازك
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUPPORTED_FORMATS.map(format => (
                      <Badge key={format} variant="outline" className="text-slate-400 border-slate-600">
                        <FileArchive className="w-3 h-3 mr-1" />
                        {format}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Upload Progress Section */}
              {uploadStatus.status !== 'idle' && (
                <div className="space-y-4 mt-6">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${
                        uploadStatus.status === 'error' ? 'text-red-400' :
                        uploadStatus.status === 'success' ? 'text-emerald-400' :
                        'text-slate-300'
                      }`}>
                        {uploadStatus.message}
                      </span>
                      <span className="text-slate-400">
                        {uploadStatus.progress}%
                      </span>
                    </div>
                    <Progress value={uploadStatus.progress} className="h-2" />
                  </div>

                  {/* Status Icons */}
                  <div className="flex items-center justify-center gap-4">
                    {(uploadStatus.status === 'uploading' || uploadStatus.status === 'extracting') && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>جاري المعالجة...</span>
                      </div>
                    )}
                    {uploadStatus.status === 'success' && (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>تم الاستخراج بنجاح!</span>
                      </div>
                    )}
                    {uploadStatus.status === 'error' && (
                      <div className="flex items-center gap-2 text-red-400">
                        <AlertCircle className="w-5 h-5" />
                        <span>حدث خطأ</span>
                      </div>
                    )}
                  </div>

                  {/* File Type Badge */}
                  {uploadStatus.fileType && uploadStatus.status === 'success' && (
                    <div className="flex justify-center">
                      <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
                        صيغة الملف: {uploadStatus.fileType.toUpperCase()}
                      </Badge>
                    </div>
                  )}

                  {/* Extracted Files List */}
                  {uploadStatus.status === 'success' && uploadStatus.files && uploadStatus.files.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                          <FolderOpen className="w-5 h-5 text-emerald-400" />
                          الملفات المستخرجة
                        </h3>
                        <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
                          {uploadStatus.totalFiles} ملف
                        </Badge>
                      </div>
                      
                      <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-900/50 border border-slate-700">
                        {uploadStatus.files.slice(0, 50).map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {file.type === 'directory' ? (
                                <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                              ) : (
                                <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span className="text-sm text-slate-300 truncate">
                                {file.path}
                              </span>
                            </div>
                            <span className="text-xs text-slate-500 shrink-0">
                              {file.type === 'file' ? formatFileSize(file.size) : '--'}
                            </span>
                          </div>
                        ))}
                        {uploadStatus.files.length > 50 && (
                          <div className="px-4 py-2 text-center text-sm text-slate-500">
                            ... و {uploadStatus.files.length - 50} ملف آخر
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {uploadStatus.status === 'error' && uploadStatus.error && (
                    <Alert className="bg-red-900/20 border-red-800">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <AlertTitle className="text-red-400">خطأ</AlertTitle>
                      <AlertDescription className="text-red-300 break-all">
                        {uploadStatus.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Deploy Section */}
              {showDeployButton && (
                <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-emerald-500/30">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Rocket className="w-5 h-5" />
                      <span className="font-medium">النظام جاهز للنشر!</span>
                    </div>
                    <p className="text-sm text-slate-400 text-center">
                      انقر على الزر أدناه لنشر ملفات النظام وتشغيله
                    </p>
                    <Button 
                      onClick={handleDeploy}
                      disabled={isDeploying}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8"
                    >
                      {isDeploying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          جاري النشر...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          تشغيل النظام
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Deploy Progress */}
              {isDeploying && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-amber-400">
                      {deployStatus.message}
                    </span>
                    <span className="text-slate-400">
                      {deployStatus.progress}%
                    </span>
                  </div>
                  <Progress value={deployStatus.progress} className="h-2" />
                </div>
              )}

              {/* Deploy Success */}
              {deployStatus.status === 'success' && (
                <Alert className="bg-emerald-900/20 border-emerald-800 mt-4">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <AlertTitle className="text-emerald-400">تم بنجاح!</AlertTitle>
                  <AlertDescription className="text-emerald-300">
                    {deployStatus.message}
                    <br />
                    <span className="text-sm">سيتم إعادة تحميل الصفحة تلقائياً...</span>
                  </AlertDescription>
                </Alert>
              )}

              {/* Deploy Error */}
              {deployStatus.status === 'error' && (
                <Alert className="bg-red-900/20 border-red-800 mt-4">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <AlertTitle className="text-red-400">خطأ في النشر</AlertTitle>
                  <AlertDescription className="text-red-300">
                    {deployStatus.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Reset Button */}
              {(uploadStatus.status === 'success' || uploadStatus.status === 'error') && 
               deployStatus.status !== 'success' && (
                <div className="flex justify-center mt-4">
                  <Button
                    onClick={resetUpload}
                    variant="outline"
                    className="gap-2"
                    disabled={isDeploying}
                  >
                    <RefreshCw className="w-4 h-4" />
                    رفع ملف آخر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-4 gap-4 text-center">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto">
                    <span className="text-emerald-400 font-bold">1</span>
                  </div>
                  <p className="text-slate-300 font-medium">ارفع الملف</p>
                  <p className="text-xs text-slate-500">اختر ملفاً مضغوطاً</p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto">
                    <span className="text-emerald-400 font-bold">2</span>
                  </div>
                  <p className="text-slate-300 font-medium">استخراج</p>
                  <p className="text-xs text-slate-500">فك ضغط الملفات</p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto">
                    <span className="text-emerald-400 font-bold">3</span>
                  </div>
                  <p className="text-slate-300 font-medium">تشغيل</p>
                  <p className="text-xs text-slate-500">انشر النظام</p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto">
                    <span className="text-emerald-400 font-bold">4</span>
                  </div>
                  <p className="text-slate-300 font-medium">استخدام</p>
                  <p className="text-xs text-slate-500">النظام جاهز!</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Supported Formats */}
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="pt-6">
              <h3 className="text-white font-medium text-center mb-4">الصيغ المدعومة</h3>
              <div className="flex flex-wrap justify-center gap-3">
                <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  .TAR
                </Badge>
                <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  .TAR.GZ
                </Badge>
                <Badge className="bg-amber-600/20 text-amber-400 border border-amber-500/30">
                  .ZIP
                </Badge>
                <Badge className="bg-purple-600/20 text-purple-400 border border-purple-500/30">
                  .RAR
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 text-center text-slate-500 text-sm border-t border-slate-800">
        <p>مستورد ملفات النظام - يدعم .tar، .tar.gz، .zip، .rar</p>
      </footer>

      {/* Auto reload on deploy success */}
      {deployStatus.status === 'success' && (
        <script dangerouslySetInnerHTML={{
          __html: `setTimeout(() => { window.location.reload(); }, 3000);`
        }} />
      )}
    </div>
  )
}
