package com.orbithr.app.core.notifications

/** FCM implementations register a rotated device token with the authenticated backend. */
interface NotificationRegistrar { suspend fun register(token:String); suspend fun unregister(token:String) }

class PendingNotificationRegistrar : NotificationRegistrar {
    override suspend fun register(token: String) = Unit
    override suspend fun unregister(token: String) = Unit
}
