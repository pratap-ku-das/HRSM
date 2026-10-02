package com.orbithr.app.core.database

import androidx.room.*
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.room.migration.Migration
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "dashboard_cache") data class DashboardCache(@PrimaryKey val id: Int = 1, val json: String, val syncedAt: Long)
@Entity(tableName = "attendance_cache") data class AttendanceCache(@PrimaryKey val id: String, val json: String, val date: String, val syncedAt: Long)

@Entity(tableName = "offline_punch_queue")
data class OfflinePunchEntity(
    @PrimaryKey val id: String,
    val action: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val deviceId: String,
    val faceVerificationToken: String? = null,
    val recordedAt: Long = System.currentTimeMillis(),
    val status: String = "PENDING",
    val retryCount: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS `offline_punch_queue` (
                `id` TEXT NOT NULL,
                `action` TEXT NOT NULL,
                `latitude` REAL NOT NULL,
                `longitude` REAL NOT NULL,
                `accuracyMeters` REAL NOT NULL,
                `deviceId` TEXT NOT NULL,
                `faceVerificationToken` TEXT,
                `recordedAt` INTEGER NOT NULL,
                `status` TEXT NOT NULL,
                `retryCount` INTEGER NOT NULL,
                `lastError` TEXT,
                `createdAt` INTEGER NOT NULL,
                PRIMARY KEY(`id`)
            )
        """.trimIndent())
    }
}

@Dao interface CacheDao {
    @Query("SELECT * FROM dashboard_cache WHERE id = 1") fun dashboard(): Flow<DashboardCache?>
    @Query("SELECT * FROM dashboard_cache WHERE id = 1") suspend fun dashboardOnce(): DashboardCache?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putDashboard(value: DashboardCache)
    @Query("SELECT * FROM attendance_cache ORDER BY date DESC") fun attendance(): Flow<List<AttendanceCache>>
    @Query("SELECT * FROM attendance_cache ORDER BY date DESC") suspend fun attendanceOnce(): List<AttendanceCache>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putAttendance(values: List<AttendanceCache>)
    @Query("DELETE FROM attendance_cache") suspend fun clearAttendance()

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun enqueuePunch(punch: OfflinePunchEntity)
    @Query("SELECT * FROM offline_punch_queue ORDER BY recordedAt ASC") fun pendingPunches(): Flow<List<OfflinePunchEntity>>
    @Query("SELECT * FROM offline_punch_queue ORDER BY recordedAt ASC") suspend fun pendingPunchesOnce(): List<OfflinePunchEntity>
    @Query("SELECT COUNT(*) FROM offline_punch_queue") fun pendingPunchCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM offline_punch_queue") suspend fun pendingPunchCountOnce(): Int
    @Update suspend fun updatePunch(punch: OfflinePunchEntity)
    @Query("DELETE FROM offline_punch_queue WHERE id = :id") suspend fun removePunch(id: String)
}

@Database(entities = [DashboardCache::class, AttendanceCache::class, OfflinePunchEntity::class], version = 2, exportSchema = false)
abstract class OrbitDatabase : RoomDatabase() { abstract fun cacheDao(): CacheDao }
