package com.orbithr.app.core.notifications

import com.orbithr.app.core.data.OrbitRepository
import javax.inject.Inject
import javax.inject.Singleton

/** FCM implementations register a rotated device token with the authenticated backend. */
interface NotificationRegistrar { suspend fun register(token:String); suspend fun unregister(token:String) }

@Singleton
class BackendNotificationRegistrar @Inject constructor(
    private val repository: OrbitRepository,
) : NotificationRegistrar {
    override suspend fun register(token: String) { repository.registerPushToken(token) }
    override suspend fun unregister(token: String) { repository.unregisterPushToken(token) }
}
