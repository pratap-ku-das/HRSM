package com.orbithr.app.core.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object OrbitNotificationChannels {
    const val GENERAL = "general"
    const val ATTENDANCE = "attendance"
    const val APPROVALS = "approvals"
    const val PAYROLL = "payroll"
    const val UPDATES = "updates"
    const val SECURITY = "security"

    fun create(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(ATTENDANCE, "Attendance", NotificationManager.IMPORTANCE_HIGH).apply { description = "Clock-in, clock-out and attendance reminders" },
                NotificationChannel(APPROVALS, "Requests and approvals", NotificationManager.IMPORTANCE_HIGH).apply { description = "Leave, expense and workflow decisions" },
                NotificationChannel(PAYROLL, "Pay and payslips", NotificationManager.IMPORTANCE_HIGH).apply { description = "Payroll and payslip availability" },
                NotificationChannel(UPDATES, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "New OrbitHR Android releases" },
                NotificationChannel(SECURITY, "Security", NotificationManager.IMPORTANCE_HIGH).apply { description = "Account and security activity" },
                NotificationChannel(GENERAL, "General", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Other OrbitHR notifications" },
            ),
        )
    }
}
