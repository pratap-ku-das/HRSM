package com.orbithr.app.core.data

import android.os.Build
import com.orbithr.app.core.auth.TokenStore
import com.orbithr.app.core.model.*
import com.orbithr.app.core.network.OrbitApi
import retrofit2.HttpException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton class OrbitRepository @Inject constructor(private val api: OrbitApi, private val tokens: TokenStore) {
    suspend fun restore(): MeDto? { val refresh = tokens.refresh() ?: return null; val session = runCatching { api.refresh(RefreshRequest(refresh, Build.MODEL)).data }.getOrElse { tokens.clear(); return null }; tokens.save(session.accessToken, session.refreshToken); return runCatching { api.me().data }.getOrNull() }
    suspend fun login(email: String, password: String): MeDto { val session = api.login(LoginRequest(email.trim(), password, Build.MODEL)).data; tokens.save(session.accessToken, session.refreshToken); return api.me().data }
    suspend fun logout() { val refresh = tokens.refresh(); if (refresh != null) runCatching { api.logout(RefreshRequest(refresh, Build.MODEL)) }; tokens.clear() }
    suspend fun dashboard() = api.dashboard().data
    suspend fun attendance() = api.attendance().data
    suspend fun punch(action: String) = api.punch(PunchRequest(action, deviceId = Build.MODEL)).data
    suspend fun leaves() = api.leaves().data
    suspend fun applyLeave(request: ApplyLeaveRequest) = api.applyLeave(request).data
    suspend fun payslips() = api.payslips().data
    suspend fun expenses() = api.expenses().data
    suspend fun submitExpense(request: SubmitExpenseRequest) = api.submitExpense(request).data
    suspend fun employees(page: Int, search: String?) = api.employees(page, search = search).data
    suspend fun onboard(request: OnboardEmployeeRequest) = api.onboard(UUID.randomUUID().toString(), request).data
}

fun Throwable.userMessage(): String = when (this) {
    is HttpException -> "Request failed (${code()}). Please check the details and try again."
    is java.io.IOException -> "OrbitHR could not reach the server. Check your connection."
    else -> message ?: "Something went wrong."
}
