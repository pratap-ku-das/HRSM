package com.orbithr.app.tracking

import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import com.orbithr.app.R
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.database.OrbitDatabase
import com.orbithr.app.core.model.PunchRequest
import com.orbithr.app.core.notifications.OrbitNotificationChannels
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.Instant
import java.util.concurrent.TimeUnit
import retrofit2.HttpException

class PunchSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface PunchSyncEntryPoint {
        fun repository(): OrbitRepository
        fun database(): OrbitDatabase
    }

    override suspend fun doWork(): Result {
        val entryPoint = EntryPointAccessors.fromApplication(
            applicationContext,
            PunchSyncEntryPoint::class.java
        )
        val repository = entryPoint.repository()
        val dao = entryPoint.database().cacheDao()

        val pending = dao.pendingPunchesOnce()
        if (pending.isEmpty()) return Result.success()

        var syncedCount = 0
        for (punch in pending) {
            try {
                dao.updatePunch(punch.copy(status = "SYNCING"))
                val recordedAtIso = Instant.ofEpochMilli(punch.recordedAt).toString()
                repository.syncOfflinePunch(
                    PunchRequest(
                        action = punch.action,
                        latitude = punch.latitude,
                        longitude = punch.longitude,
                        locationAccuracyMeters = punch.accuracyMeters,
                        deviceId = punch.deviceId,
                        faceVerificationToken = punch.faceVerificationToken ?: "",
                        recordedAt = recordedAtIso
                    )
                )
                dao.removePunch(punch.id)
                syncedCount++
            } catch (e: HttpException) {
                // If 409 already clocked in/out or already processed, treat as idempotent success
                if (e.code() == 409) {
                    dao.removePunch(punch.id)
                    syncedCount++
                } else if (e.code() in 400..499) {
                    // Permanent client validation error
                    dao.updatePunch(punch.copy(status = "FAILED", lastError = e.message()))
                } else {
                    dao.updatePunch(punch.copy(status = "PENDING", retryCount = punch.retryCount + 1, lastError = e.message()))
                    return Result.retry()
                }
            } catch (e: Exception) {
                dao.updatePunch(punch.copy(status = "PENDING", retryCount = punch.retryCount + 1, lastError = e.message))
                return Result.retry()
            }
        }

        if (syncedCount > 0) {
            runCatching { repository.attendance() }
            showSyncNotification(applicationContext, syncedCount)
        }

        return Result.success()
    }

    private fun showSyncNotification(context: Context, count: Int) {
        val message = if (count == 1) "Your offline punch has been synced with the server." else "$count offline punches have been synced with the server."
        val notification = NotificationCompat.Builder(context, OrbitNotificationChannels.UPDATES)
            .setSmallIcon(R.drawable.ic_orbithr_launcher)
            .setContentTitle("Attendance Synced")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(2001, notification)
        } catch (_: SecurityException) {
        }
    }

    companion object {
        private const val WORK_NAME = "OrbitPunchSync"

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<PunchSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }
}
