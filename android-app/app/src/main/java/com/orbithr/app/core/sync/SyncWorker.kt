package com.orbithr.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.orbithr.app.core.data.OrbitRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker class SyncWorker @AssistedInject constructor(@Assisted context: Context,@Assisted params: WorkerParameters,private val repository: OrbitRepository):CoroutineWorker(context,params){override suspend fun doWork():Result=runCatching{repository.dashboard();Result.success()}.getOrElse{Result.retry()}}
