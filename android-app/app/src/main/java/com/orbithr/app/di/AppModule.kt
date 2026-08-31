package com.orbithr.app.di

import android.content.Context
import androidx.room.Room
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.orbithr.app.BuildConfig
import com.orbithr.app.core.database.OrbitDatabase
import com.orbithr.app.core.network.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import javax.inject.Singleton

@Module @InstallIn(SingletonComponent::class) object AppModule {
    @Provides @Singleton fun json() = Json { ignoreUnknownKeys = true; explicitNulls = false }
    @Provides @Singleton fun refreshApi(json: Json): RefreshApi = Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(OkHttpClient.Builder().build()).addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(RefreshApi::class.java)
    @Provides @Singleton fun api(json: Json, interceptor: AuthInterceptor, authenticator: TokenAuthenticator): OrbitApi {
        val logger = HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE; redactHeader("Authorization") }
        val client = OkHttpClient.Builder().addInterceptor(interceptor).authenticator(authenticator).addInterceptor(logger).build()
        return Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client).addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(OrbitApi::class.java)
    }
    @Provides @Singleton fun db(@ApplicationContext context: Context) = Room.databaseBuilder(context, OrbitDatabase::class.java, "orbithr-cache.db").fallbackToDestructiveMigration(false).build()
}
