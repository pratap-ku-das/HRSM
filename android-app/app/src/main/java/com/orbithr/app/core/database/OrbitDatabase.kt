package com.orbithr.app.core.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "dashboard_cache") data class DashboardCache(@PrimaryKey val id: Int = 1, val json: String, val syncedAt: Long)
@Entity(tableName = "attendance_cache") data class AttendanceCache(@PrimaryKey val id: String, val json: String, val date: String, val syncedAt: Long)
@Dao interface CacheDao {
    @Query("SELECT * FROM dashboard_cache WHERE id = 1") fun dashboard(): Flow<DashboardCache?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putDashboard(value: DashboardCache)
    @Query("SELECT * FROM attendance_cache ORDER BY date DESC") fun attendance(): Flow<List<AttendanceCache>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putAttendance(values: List<AttendanceCache>)
}
@Database(entities = [DashboardCache::class, AttendanceCache::class], version = 1, exportSchema = false)
abstract class OrbitDatabase : RoomDatabase() { abstract fun cacheDao(): CacheDao }
