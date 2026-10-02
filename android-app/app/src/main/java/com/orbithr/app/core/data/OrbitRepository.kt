package com.orbithr.app.core.data

import android.content.Context
import android.os.Build
import androidx.core.content.FileProvider
import com.orbithr.app.core.database.AttendanceCache
import com.orbithr.app.core.database.DashboardCache
import com.orbithr.app.core.database.OrbitDatabase
import com.orbithr.app.core.auth.TokenStore
import com.orbithr.app.core.model.*
import com.orbithr.app.core.network.OrbitApi
import retrofit2.HttpException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton
import dagger.hilt.android.qualifiers.ApplicationContext

@Singleton class OrbitRepository @Inject constructor(private val api: OrbitApi, private val tokens: TokenStore,private val database:OrbitDatabase,private val json:Json,@ApplicationContext private val context:Context) {
    suspend fun androidRelease() = api.androidRelease().data
    suspend fun restore(): MeDto? { val refresh = tokens.refresh() ?: return null; val session = runCatching { api.refresh(RefreshRequest(refresh, Build.MODEL)).data }.getOrElse { tokens.clear(); return null }; tokens.save(session.accessToken, session.refreshToken); return runCatching { api.me().data }.getOrNull() }
    suspend fun login(email: String, password: String, mfaCode:String?): MeDto { val session = api.login(LoginRequest(email.trim(), password, Build.MODEL, mfaCode)).data; tokens.save(session.accessToken, session.refreshToken); return api.me().data }
    suspend fun forgotPassword(email:String)=api.forgotPassword(EmailRequest(email.trim())).data
    suspend fun activateAccount(token:String,password:String)=api.activateAccount(TokenPasswordRequest(token.trim(),password)).data
    suspend fun resetPassword(token:String,password:String)=api.resetPassword(TokenPasswordRequest(token.trim(),password)).data
    suspend fun logout() { val refresh = tokens.refresh(); if (refresh != null) runCatching { api.logout(RefreshRequest(refresh, Build.MODEL)) }; tokens.clear() }
    suspend fun dashboard():DashboardDto = runCatching{api.dashboard().data.also{database.cacheDao().putDashboard(DashboardCache(json=json.encodeToString(it),syncedAt=System.currentTimeMillis()))}}.getOrElse{error->database.cacheDao().dashboardOnce()?.let{json.decodeFromString<DashboardDto>(it.json)}?:throw error}
    suspend fun attendance():List<AttendanceDto> = runCatching{api.attendance().data.also{rows->database.cacheDao().clearAttendance();database.cacheDao().putAttendance(rows.map{AttendanceCache(it.id,json.encodeToString(it),it.date,System.currentTimeMillis())})}}.getOrElse{error->database.cacheDao().attendanceOnce().takeIf{it.isNotEmpty()}?.map{json.decodeFromString<AttendanceDto>(it.json)}?:throw error}
    suspend fun verifyFace(action: String, selfie: ByteArray, latitude: Double, longitude: Double, accuracyMeters: Float, deviceId: String): AttendanceVerificationProof {
        val challenge = api.faceChallenge(FaceChallengeRequest(action, deviceId)).data
        val textType = "text/plain".toMediaType()
        val image = MultipartBody.Part.createFormData("selfie", "live-face.jpg", selfie.toRequestBody("image/jpeg".toMediaType()))
        val verified = api.verifyFace(
            image,
            challenge.challengeId.toRequestBody(textType),
            deviceId.toRequestBody(textType),
            "true".toRequestBody(textType),
        ).data
        return AttendanceVerificationProof(action, verified.faceVerificationToken, verified.similarity, latitude, longitude, accuracyMeters, deviceId, System.currentTimeMillis())
    }
    suspend fun syncOfflinePunch(request: PunchRequest): AttendanceDto = api.punch(request).data
    fun pendingPunchCount() = database.cacheDao().pendingPunchCount()
    suspend fun punch(action: String, proof: AttendanceVerificationProof? = null): AttendanceDto {
        val p = requireNotNull(proof)
        val nowMillis = System.currentTimeMillis()
        val request = PunchRequest(
            action = action,
            latitude = p.latitude,
            longitude = p.longitude,
            locationAccuracyMeters = p.accuracyMeters,
            deviceId = p.deviceId,
            faceVerificationToken = p.faceVerificationToken,
            recordedAt = java.time.Instant.ofEpochMilli(nowMillis).toString(),
        )
        return try {
            val response = api.punch(request).data
            runCatching { attendance() }
            response
        } catch (e: Exception) {
            val isNetworkIssue = e is java.io.IOException || e is java.net.SocketTimeoutException || e is java.net.UnknownHostException
            if (isNetworkIssue) {
                val punchId = UUID.randomUUID().toString()
                val offlineEntity = com.orbithr.app.core.database.OfflinePunchEntity(
                    id = punchId,
                    action = action,
                    latitude = p.latitude,
                    longitude = p.longitude,
                    accuracyMeters = p.accuracyMeters,
                    deviceId = p.deviceId,
                    faceVerificationToken = p.faceVerificationToken,
                    recordedAt = nowMillis,
                    status = "PENDING",
                    createdAt = nowMillis
                )
                database.cacheDao().enqueuePunch(offlineEntity)

                val optimistic = AttendanceDto(
                    id = "offline-$punchId",
                    date = java.time.LocalDate.now().toString(),
                    status = "PENDING_SYNC",
                    clockInTime = if (action == "CLOCK_IN") java.time.Instant.ofEpochMilli(nowMillis).toString() else null,
                    clockOutTime = if (action == "CLOCK_OUT") java.time.Instant.ofEpochMilli(nowMillis).toString() else null,
                    source = "MOBILE_OFFLINE",
                    faceAuthVerified = true,
                    locationLat = p.latitude,
                    locationLng = p.longitude,
                    workdayGpsTrackingEnabled = false
                )

                val current = database.cacheDao().attendanceOnce()
                val updatedCache = listOf(com.orbithr.app.core.database.AttendanceCache(optimistic.id, json.encodeToString(optimistic), optimistic.date, nowMillis)) + current
                database.cacheDao().putAttendance(updatedCache)

                com.orbithr.app.tracking.PunchSyncWorker.enqueue(context)
                optimistic
            } else {
                throw e
            }
        }
    }
    suspend fun trackingStatus()=api.trackingStatus().data
    suspend fun uploadLocationBatch(deviceId:String,points:List<LocationPointRequest>)=api.uploadLocationBatch(LocationBatchRequest(deviceId,points)).data
    suspend fun attendanceRequests() = api.attendanceRequests().data
    suspend fun submitAttendanceRequest(body: CreateAttendanceRequest) = api.submitAttendanceRequest(body).data
    suspend fun startBreak() = api.startBreak().data
    suspend fun endBreak() = api.endBreak().data
    suspend fun approvalInbox() = api.approvalInbox().data
    suspend fun myRequests() = api.myRequests().data
    suspend fun workflowAction(id: String, action: String, comment: String?) = api.workflowAction(id, WorkflowActionRequest(action, comment)).data
    suspend fun notifications() = api.notifications().data
    suspend fun readNotification(id: String) = api.readNotification(id).data
    suspend fun readAllNotifications() = api.readAllNotifications().data
    suspend fun registerPushToken(token:String)=api.registerPushDevice(PushDeviceRequest(token,Build.MODEL,com.orbithr.app.BuildConfig.VERSION_CODE,com.orbithr.app.BuildConfig.VERSION_NAME)).data
    suspend fun unregisterPushToken(token:String)=api.unregisterPushDevice(PushDeviceRequest(token,Build.MODEL)).data
    suspend fun securityWorkspace()=SecurityWorkspace(api.mfaStatus().data,api.securitySessions().data,api.loginHistory().data)
    suspend fun setupMfa()=api.setupMfa().data
    suspend fun confirmMfa(code:String)=api.confirmMfa(MfaCodeRequest(code)).data
    suspend fun disableMfa(code:String)=api.disableMfa(MfaCodeRequest(code)).data
    suspend fun revokeSecuritySession(id:String)=api.revokeSecuritySession(id).data
    suspend fun operationsWorkspace()=api.operationsWorkspace().data
    suspend fun uploadCompanyDocument(file:PendingFile):CompanyDocumentDto{
        val text="text/plain".toMediaType()
        val upload=MultipartBody.Part.createFormData("document",file.fileName,file.bytes.toRequestBody(file.mimeType.toMediaType()))
        return api.uploadCompanyDocument(upload,file.title.toRequestBody(text),file.category.toRequestBody(text)).data
    }
    suspend fun openCompanyDocument(id:String)=openProtectedFile(api.companyDocumentFile(id),"company-document")
    suspend fun workspaceSettings()=api.workspaceSettings().data?:WorkspaceSettingsDto()
    suspend fun updateWorkspaceSettings(body:WorkspaceSettingsDto)=api.updateWorkspaceSettings(body).data
    suspend fun mobileWorkspace() = api.mobileWorkspace().data
    suspend fun createServiceRequest(body:CreateServiceRequest)=api.createServiceRequest(body).data
    suspend fun leaves() = api.leaves().data
    suspend fun applyLeave(request: ApplyLeaveRequest) = api.applyLeave(request).data
    suspend fun payslips() = api.payslips().data
    suspend fun expenses() = api.expenses().data
    suspend fun submitExpense(request: SubmitExpenseRequest) = api.submitExpense(request).data
    suspend fun departments() = api.departments().data
    suspend fun designations() = api.designations().data
    suspend fun employees(page: Int, search: String?) = api.employees(page, search = search).data
    suspend fun updateEmployee(id:String,body:UpdateEmployeeRequest)=api.updateEmployee(id,body).data
    suspend fun deleteEmployee(id:String)=api.deleteEmployee(id).data
    suspend fun updateEmployeeLifecycle(id:String,body:EmployeeLifecycleRequest)=api.updateEmployeeLifecycle(id,body).data
    suspend fun onboard(request: OnboardEmployeeRequest) = api.onboard(UUID.randomUUID().toString(), request).data
    suspend fun salaryStructures() = api.payrollConfiguration().data.structures
    suspend fun payrollConfiguration() = api.payrollConfiguration().data
    suspend fun createPayrollRun(month:String) = api.createPayrollRun(CreatePayrollRunRequest(month)).data
    suspend fun advancePayroll(run:PayrollRunMobileDto) {
        when(run.status){
            "DRAFT" -> api.payrollAttendance(run.id)
            "ATTENDANCE_REVIEW" -> api.finalizePayrollAttendance(run.id)
            "ATTENDANCE_FINALIZED","ATTENDANCE_LOCKED" -> api.calculatePayroll(run.id)
            "CALCULATED","REJECTED" -> api.submitPayroll(run.id)
            "PENDING_APPROVAL" -> api.approvePayroll(run.id)
            "APPROVED" -> api.generatePayrollPayslips(run.id)
            "PAYSLIP_GENERATED" -> api.publishPayroll(run.id)
        }
    }
    suspend fun onboardStaged(request: MobileOnboardingRequest): OnboardingDto {
        val draft = api.createOnboarding().data
        api.saveOnboardingPersonal(draft.id, request.personal)
        val documents=request.documents.map{pending->
            val upload=MultipartBody.Part.createFormData("document",pending.fileName,pending.bytes.toRequestBody(pending.mimeType.toMediaType()))
            api.uploadOnboardingDocument(upload).data.copy(documentType=pending.documentType,title=pending.title)
        }
        api.saveOnboardingDocuments(draft.id, DocumentsOnboardingSection(documents))
        api.saveOnboardingSalary(draft.id, request.salary)
        api.saveOnboardingFace(draft.id, request.face)
        api.saveOnboardingAdditional(draft.id, request.additional)
        api.reviewOnboarding(draft.id)
        return api.completeOnboarding(draft.id).data
    }
    suspend fun openEmployeeDocument(id:String):OpenedDocument{
        return openProtectedFile(api.employeeDocumentFile(id),"employee-document")
    }
    private fun openProtectedFile(response:retrofit2.Response<okhttp3.ResponseBody>,fallbackName:String):OpenedDocument{
        if(!response.isSuccessful)throw HttpException(response)
        val body=response.body()?:error("Document file was empty.")
        val disposition=response.headers()["content-disposition"].orEmpty()
        val rawName=Regex("filename\\*=UTF-8''([^;]+)",RegexOption.IGNORE_CASE).find(disposition)?.groupValues?.get(1)?.let{java.net.URLDecoder.decode(it,"UTF-8")}?:Regex("filename=\"?([^\";]+)").find(disposition)?.groupValues?.get(1)?:fallbackName
        val safeName=rawName.replace(Regex("[^A-Za-z0-9._ -]"),"_").take(120)
        val folder=File(context.cacheDir,"document-previews").apply{mkdirs()}
        val file=File(folder,"${System.currentTimeMillis()}-$safeName")
        body.byteStream().use{input->file.outputStream().use{output->input.copyTo(output)}}
        val uri=FileProvider.getUriForFile(context,"${context.packageName}.files",file)
        return OpenedDocument(uri.toString(),body.contentType()?.toString()?:"application/octet-stream",safeName)
    }
}

fun Throwable.userMessage(): String = when (this) {
    is HttpException -> runCatching {
        JSONObject(response()?.errorBody()?.string().orEmpty()).getJSONObject("error").getString("message")
    }.getOrDefault("Request failed (${code()}). Please check the details and try again.")
    is java.io.IOException -> "OrbitHR could not reach the server. Check your connection."
    else -> message ?: "Something went wrong."
}
