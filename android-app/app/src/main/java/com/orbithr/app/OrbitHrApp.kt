package com.orbithr.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.orbithr.app.core.notifications.OrbitNotificationChannels
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class OrbitHrApp : Application() {
    override fun onCreate() {
        super.onCreate()
        OrbitNotificationChannels.create(this)
        // Returns null in local builds without google-services.json; the rest of
        // OrbitHR continues to work and push activates after production setup.
        FirebaseApp.initializeApp(this)
    }
}
