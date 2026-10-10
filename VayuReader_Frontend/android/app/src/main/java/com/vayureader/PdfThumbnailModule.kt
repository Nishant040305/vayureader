package com.vayureader

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

@ReactModule(name = PdfThumbnailModule.NAME)
class PdfThumbnailModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PdfThumbnail"
    }

    private val executor = Executors.newCachedThreadPool()

    override fun getName(): String {
        return NAME
    }

    @ReactMethod
    fun generateThumbnail(pdfPath: String, outputPath: String?, pageIndex: Int, promise: Promise) {
        executor.execute {
            var pfd: ParcelFileDescriptor? = null
            var renderer: PdfRenderer? = null
            var page: PdfRenderer.Page? = null
            var fos: FileOutputStream? = null
            var bitmap: Bitmap? = null

            try {
                pfd = when {
                    pdfPath.startsWith("content://") -> {
                        reactContext.contentResolver.openFileDescriptor(Uri.parse(pdfPath), "r")
                    }
                    else -> {
                        val cleanPath = if (pdfPath.startsWith("file://")) {
                            pdfPath.substring(7)
                        } else {
                            pdfPath
                        }
                        val file = File(cleanPath)
                        if (!file.exists()) {
                            promise.reject("FILE_NOT_FOUND", "PDF file not found at: $cleanPath")
                            return@execute
                        }
                        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                    }
                }

                if (pfd == null) {
                    promise.reject("OPEN_FAILED", "Failed to open file descriptor for: $pdfPath")
                    return@execute
                }

                renderer = PdfRenderer(pfd)
                if (renderer.pageCount == 0) {
                    promise.reject("EMPTY_PDF", "PDF file contains 0 pages")
                    return@execute
                }

                val targetPageIndex = if (pageIndex in 0 until renderer.pageCount) pageIndex else 0
                page = renderer.openPage(targetPageIndex)

                val origWidth = page.width
                val origHeight = page.height

                // Render crisp cover thumbnail (max dimension ~ 600px for sharp rendering without memory bloat)
                val maxDim = 600
                val scale = if (Math.max(origWidth, origHeight) > maxDim) {
                    maxDim.toFloat() / Math.max(origWidth, origHeight).toFloat()
                } else {
                    1.0f
                }
                val renderWidth = Math.max(1, (origWidth * scale).toInt())
                val renderHeight = Math.max(1, (origHeight * scale).toInt())

                bitmap = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)
                // Draw white background because PDFs often have transparent backgrounds
                canvas.drawColor(Color.WHITE)

                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                if (outputPath.isNullOrBlank()) {
                    // In-memory only: encode directly to JPEG Base64 Data URI so NO file is saved to disk
                    val baos = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, baos)
                    val bytes = baos.toByteArray()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    promise.resolve("data:image/jpeg;base64,$base64")
                } else {
                    val cleanOut = if (outputPath.startsWith("file://")) outputPath.substring(7) else outputPath
                    val destFile = File(cleanOut)
                    destFile.parentFile?.mkdirs()
                    fos = FileOutputStream(destFile)
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                    fos.flush()
                    promise.resolve(destFile.absolutePath)
                }
            } catch (e: Exception) {
                promise.reject("THUMBNAIL_ERROR", "Failed to generate thumbnail: ${e.message}", e)
            } finally {
                try { fos?.close() } catch (_: Exception) {}
                try { bitmap?.recycle() } catch (_: Exception) {}
                try { page?.close() } catch (_: Exception) {}
                try { renderer?.close() } catch (_: Exception) {}
                try { pfd?.close() } catch (_: Exception) {}
            }
        }
    }
}
