package com.orbithr.app.tracking

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.orbithr.app.MainActivity
import com.orbithr.app.R
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.model.LocationPointRequest
import dagger.hilt.android.AndroidEntryPoint
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import retrofit2.HttpException

@AndroidEntryPoint
class WorkdayTrackingService:Service(){
    @Inject lateinit var repository:OrbitRepository
    @Inject lateinit var json:Json
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private val fused by lazy{LocationServices.getFusedLocationProviderClient(this)}
    private val preferences by lazy{getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE)}
    private var uploadJob:Job?=null
    private val callback=object:LocationCallback(){
        override fun onLocationResult(result:LocationResult){
            result.locations.forEach{location->
                if(!LocationCompat.isMock(location)&&location.hasAccuracy()&&location.accuracy<=200f){
                    enqueue(LocationPointRequest(UUID.randomUUID().toString(),location.latitude,location.longitude,location.accuracy,location.speed.takeIf{location.hasSpeed()},location.bearing.takeIf{location.hasBearing()},Instant.ofEpochMilli(location.time).toString()))
                }
            }
            flush()
        }
    }

    override fun onCreate(){
        super.onCreate()
        createChannel()
        startForeground(NOTIFICATION_ID,NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(R.drawable.ic_orbithr_launcher).setContentTitle("OrbitHR workday route is active").setContentText("Location is recorded only until you clock out.").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build())
        scope.launch{runCatching{repository.trackingStatus()}.onSuccess{status->if(!status.active)stopSelf()else startUpdates()}.onFailure{startUpdates()}}
    }

    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        if(intent?.action==ACTION_STOP){stopSelf();return START_NOT_STICKY}
        return START_STICKY
    }

    private fun startUpdates(){
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return}
        val request=LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,30_000L).setMinUpdateIntervalMillis(15_000L).setMinUpdateDistanceMeters(20f).build()
        fused.requestLocationUpdates(request,callback,mainLooper)
    }

    @Synchronized private fun enqueue(point:LocationPointRequest){
        val queue=readQueue().toMutableList().apply{add(point);while(size>500)removeAt(0)}
        preferences.edit().putString(QUEUE_KEY,json.encodeToString(queue)).apply()
    }

    @Synchronized private fun readQueue():List<LocationPointRequest> = runCatching{json.decodeFromString<List<LocationPointRequest>>(preferences.getString(QUEUE_KEY,null)?:"[]")}.getOrDefault(emptyList())

    private fun flush(){
        if(uploadJob?.isActive==true)return
        uploadJob=scope.launch{
            val batch=readQueue().take(50)
            if(batch.isEmpty())return@launch
            runCatching{repository.uploadLocationBatch(deviceId(),batch)}.onSuccess{
                val sent=batch.map{point->point.id}.toSet()
                val remaining=readQueue().filterNot{point->point.id in sent}
                preferences.edit().putString(QUEUE_KEY,json.encodeToString(remaining)).apply()
                if(remaining.isNotEmpty())flush()
            }.onFailure{error->
                if(error is HttpException&&error.code() in listOf(401,403,409)){
                    preferences.edit().remove(QUEUE_KEY).apply()
                    stopSelf()
                }
            }
        }
    }

    override fun onDestroy(){fused.removeLocationUpdates(callback);scope.coroutineContext.cancel();super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null

    private fun createChannel(){(getSystemService(NOTIFICATION_SERVICE)as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL_ID,"Workday location tracking",NotificationManager.IMPORTANCE_LOW).apply{description="Visible while an enabled employee is clocked in"})}
    private fun deviceId():String{val raw=Settings.Secure.getString(contentResolver,Settings.Secure.ANDROID_ID).orEmpty();return MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString(""){"%02x".format(it)}}

    companion object{
        private const val CHANNEL_ID="orbithr_workday_tracking"
        private const val NOTIFICATION_ID=4021
        private const val PREFERENCES="workday-tracking"
        private const val QUEUE_KEY="pending-points"
        private const val ACTION_STOP="com.orbithr.app.STOP_WORKDAY_TRACKING"
        fun start(context:Context)=ContextCompat.startForegroundService(context,Intent(context,WorkdayTrackingService::class.java))
        fun stop(context:Context)=context.stopService(Intent(context,WorkdayTrackingService::class.java).setAction(ACTION_STOP))
    }
}
