package com.orbithr.app.core.notifications

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.orbithr.app.MainActivity
import com.orbithr.app.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@AndroidEntryPoint
class OrbitFirebaseMessagingService : FirebaseMessagingService() {
    @Inject lateinit var registrar: BackendNotificationRegistrar
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        serviceScope.launch { runCatching { registrar.register(token) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "OrbitHR"
        val body = message.notification?.body ?: message.data["body"] ?: return
        val eventKey = message.data["eventKey"].orEmpty()
        val notificationId = message.data["notificationId"].orEmpty()
        val actionUrl = message.data["actionUrl"] ?: "/notifications"
        val channel = when {
            eventKey.startsWith("ATTENDANCE_") -> OrbitNotificationChannels.ATTENDANCE
            eventKey.contains("APPROVAL") || eventKey.startsWith("LEAVE_") || eventKey.startsWith("EXPENSE_") -> OrbitNotificationChannels.APPROVALS
            eventKey.startsWith("PAYROLL_") || eventKey.startsWith("PAYSLIP_") -> OrbitNotificationChannels.PAYROLL
            eventKey == "APP_UPDATE_AVAILABLE" -> OrbitNotificationChannels.UPDATES
            eventKey.startsWith("SECURITY_") || eventKey.startsWith("MFA_") -> OrbitNotificationChannels.SECURITY
            else -> OrbitNotificationChannels.GENERAL
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_NOTIFICATION_ROUTE, actionUrl)
            putExtra(MainActivity.EXTRA_NOTIFICATION_ID, notificationId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_orbithr_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(notificationId.hashCode(), notification) }
    }
}
