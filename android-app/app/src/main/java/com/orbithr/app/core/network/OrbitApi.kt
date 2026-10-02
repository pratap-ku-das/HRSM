package com.orbithr.app.core.network

import com.orbithr.app.core.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface OrbitApi {
    @GET("mobile/android-release") suspend fun androidRelease(): ApiEnvelope<AndroidReleaseDto>
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): ApiEnvelope<SessionDto>
    @POST("auth/forgot-password") suspend fun forgotPassword(@Body body:EmailRequest):ApiEnvelope<Map<String,Boolean>>
    @POST("auth/activate") suspend fun activateAccount(@Body body:TokenPasswordRequest):ApiEnvelope<Map<String,Boolean>>
    @POST("auth/reset-password") suspend fun resetPassword(@Body body:TokenPasswordRequest):ApiEnvelope<Map<String,Boolean>>
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshRequest): ApiEnvelope<SessionDto>
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest): ApiEnvelope<Map<String, Boolean>>
    @GET("me") suspend fun me(): ApiEnvelope<MeDto>
    @GET("dashboard") suspend fun dashboard(): ApiEnvelope<DashboardDto>
    @GET("me/attendance") suspend fun attendance(@Query("from") from: String? = null): ApiEnvelope<List<AttendanceDto>>
    @POST("me/face/challenge") suspend fun faceChallenge(@Body body: FaceChallengeRequest): ApiEnvelope<FaceChallengeDto>
    @Multipart @POST("me/face/verify") suspend fun verifyFace(
        @Part selfie: MultipartBody.Part,
        @Part("challengeId") challengeId: RequestBody,
        @Part("deviceId") deviceId: RequestBody,
        @Part("livenessVerified") livenessVerified: RequestBody,
    ): ApiEnvelope<FaceVerificationDto>
    @POST("me/attendance/punch") suspend fun punch(@Body body: PunchRequest): ApiEnvelope<AttendanceDto>
    @GET("me/attendance/tracking-status") suspend fun trackingStatus():ApiEnvelope<TrackingStatusDto>
    @POST("me/attendance/location-batch") suspend fun uploadLocationBatch(@Body body:LocationBatchRequest):ApiEnvelope<LocationBatchResult>
    @GET("me/attendance/requests") suspend fun attendanceRequests(): ApiEnvelope<List<AttendanceRequestDto>>
    @POST("me/attendance/requests") suspend fun submitAttendanceRequest(@Body body: CreateAttendanceRequest): ApiEnvelope<AttendanceRequestDto>
    @POST("me/attendance/breaks/start") suspend fun startBreak(): ApiEnvelope<BreakSessionDto>
    @POST("me/attendance/breaks/end") suspend fun endBreak(): ApiEnvelope<BreakSessionDto>
    @GET("workflows/inbox") suspend fun approvalInbox(): ApiEnvelope<List<ApprovalInboxDto>>
    @GET("workflows/my-requests") suspend fun myRequests(): ApiEnvelope<List<WorkflowInstanceDto>>
    @POST("workflows/instances/{id}/actions") suspend fun workflowAction(@Path("id") id: String, @Body body: WorkflowActionRequest): ApiEnvelope<WorkflowActionResult>
    @GET("notifications") suspend fun notifications(): ApiEnvelope<List<NotificationDto>>
    @PATCH("notifications/{id}/read") suspend fun readNotification(@Path("id") id: String): ApiEnvelope<Map<String, Boolean>>
    @POST("notifications/read-all") suspend fun readAllNotifications(): ApiEnvelope<Map<String, Int>>
    @POST("notifications/devices/register") suspend fun registerPushDevice(@Body body:PushDeviceRequest):ApiEnvelope<Map<String,Boolean>>
    @POST("notifications/devices/unregister") suspend fun unregisterPushDevice(@Body body:PushDeviceRequest):ApiEnvelope<Map<String,Boolean>>
    @GET("security/mfa") suspend fun mfaStatus():ApiEnvelope<MfaStatusDto>
    @POST("security/mfa/setup") suspend fun setupMfa():ApiEnvelope<MfaSetupDto>
    @POST("security/mfa/confirm") suspend fun confirmMfa(@Body body:MfaCodeRequest):ApiEnvelope<MfaStatusDto>
    @POST("security/mfa/disable") suspend fun disableMfa(@Body body:MfaCodeRequest):ApiEnvelope<MfaDisableDto>
    @GET("security/sessions") suspend fun securitySessions():ApiEnvelope<List<SecuritySessionDto>>
    @DELETE("security/sessions/{id}") suspend fun revokeSecuritySession(@Path("id") id:String):ApiEnvelope<Map<String,Boolean>>
    @GET("security/login-history") suspend fun loginHistory():ApiEnvelope<List<LoginHistoryDto>>
    @GET("operations/workspace") suspend fun operationsWorkspace():ApiEnvelope<OperationsWorkspaceDto>
    @Multipart @POST("operations/company-documents/upload") suspend fun uploadCompanyDocument(@Part document:MultipartBody.Part,@Part("title") title:RequestBody,@Part("category") category:RequestBody):ApiEnvelope<CompanyDocumentDto>
    @Streaming @GET("operations/company-documents/{id}/file") suspend fun companyDocumentFile(@Path("id") id:String):Response<ResponseBody>
    @GET("workspace-settings") suspend fun workspaceSettings():ApiEnvelope<WorkspaceSettingsDto?>
    @PUT("workspace-settings") suspend fun updateWorkspaceSettings(@Body body:WorkspaceSettingsDto):ApiEnvelope<WorkspaceSettingsDto>
    @GET("me/mobile-workspace") suspend fun mobileWorkspace(): ApiEnvelope<MobileWorkspaceDto>
    @POST("me/service-requests") suspend fun createServiceRequest(@Body body:CreateServiceRequest):ApiEnvelope<ServiceRequestDto>
    @GET("me/leaves") suspend fun leaves(): ApiEnvelope<LeavesDto>
    @POST("me/leaves") suspend fun applyLeave(@Body body: ApplyLeaveRequest): ApiEnvelope<LeaveRequestDto>
    @GET("me/payslips") suspend fun payslips(): ApiEnvelope<List<PayslipDto>>
    @GET("me/expenses") suspend fun expenses(): ApiEnvelope<List<ExpenseDto>>
    @POST("me/expenses") suspend fun submitExpense(@Body body: SubmitExpenseRequest): ApiEnvelope<ExpenseDto>
    @GET("departments") suspend fun departments(): ApiEnvelope<List<DepartmentDto>>
    @GET("designations") suspend fun designations(): ApiEnvelope<List<DesignationDto>>
    @GET("employees") suspend fun employees(@Query("page") page: Int, @Query("pageSize") pageSize: Int = 25, @Query("search") search: String? = null): ApiEnvelope<List<EmployeeDto>>
    @PATCH("employees/{id}") suspend fun updateEmployee(@Path("id") id:String,@Body body:UpdateEmployeeRequest):ApiEnvelope<EmployeeDto>
    @DELETE("employees/{id}") suspend fun deleteEmployee(@Path("id") id:String):ApiEnvelope<Map<String,Boolean>>
    @PATCH("employees/{id}/lifecycle") suspend fun updateEmployeeLifecycle(@Path("id") id:String,@Body body:EmployeeLifecycleRequest):ApiEnvelope<EmployeeDto>
    @POST("employees/onboard") suspend fun onboard(@Header("Idempotency-Key") key: String, @Body body: OnboardEmployeeRequest): ApiEnvelope<OnboardingDto>
    @GET("payroll/config") suspend fun payrollConfiguration(): ApiEnvelope<PayrollConfigurationOptionDto>
    @POST("employees/onboarding") suspend fun createOnboarding(): ApiEnvelope<OnboardingDraftDto>
    @Multipart @POST("employees/onboarding/document-upload") suspend fun uploadOnboardingDocument(@Part document:MultipartBody.Part):ApiEnvelope<OnboardingDocumentDto>
    @PUT("employees/onboarding/{id}/personal") suspend fun saveOnboardingPersonal(@Path("id") id:String,@Body body:PersonalOnboardingSection):ApiEnvelope<OnboardingDraftDto>
    @PUT("employees/onboarding/{id}/documents") suspend fun saveOnboardingDocuments(@Path("id") id:String,@Body body:DocumentsOnboardingSection):ApiEnvelope<OnboardingDraftDto>
    @PUT("employees/onboarding/{id}/salary") suspend fun saveOnboardingSalary(@Path("id") id:String,@Body body:SalaryOnboardingSection):ApiEnvelope<OnboardingDraftDto>
    @PUT("employees/onboarding/{id}/face") suspend fun saveOnboardingFace(@Path("id") id:String,@Body body:FaceOnboardingSection):ApiEnvelope<OnboardingDraftDto>
    @PUT("employees/onboarding/{id}/additional") suspend fun saveOnboardingAdditional(@Path("id") id:String,@Body body:AdditionalOnboardingSection):ApiEnvelope<OnboardingDraftDto>
    @POST("employees/onboarding/{id}/review") suspend fun reviewOnboarding(@Path("id") id:String):ApiEnvelope<OnboardingDraftDto>
    @POST("employees/onboarding/{id}/complete") suspend fun completeOnboarding(@Path("id") id:String):ApiEnvelope<OnboardingDto>
    @POST("payroll/runs") suspend fun createPayrollRun(@Body body:CreatePayrollRunRequest):ApiEnvelope<PayrollRunMobileDto>
    @GET("payroll/runs/{id}/attendance") suspend fun payrollAttendance(@Path("id") id:String):ApiEnvelope<List<PayrollAttendanceReviewMobileDto>>
    @POST("payroll/runs/{id}/finalize-attendance") suspend fun finalizePayrollAttendance(@Path("id") id:String,@Body body:PayrollConfirmationRequest=PayrollConfirmationRequest()):ApiEnvelope<PayrollRunMobileDto>
    @POST("payroll/runs/{id}/calculate") suspend fun calculatePayroll(@Path("id") id:String):ApiEnvelope<PayrollRunMobileDto>
    @POST("payroll/runs/{id}/submit") suspend fun submitPayroll(@Path("id") id:String):ApiEnvelope<PayrollRunMobileDto>
    @POST("payroll/runs/{id}/approve") suspend fun approvePayroll(@Path("id") id:String,@Body body:PayrollDecisionRequest=PayrollDecisionRequest()):ApiEnvelope<PayrollRunMobileDto>
    @POST("payroll/runs/{id}/generate-payslips") suspend fun generatePayrollPayslips(@Path("id") id:String):ApiEnvelope<Map<String,Int>>
    @POST("payroll/runs/{id}/publish") suspend fun publishPayroll(@Path("id") id:String):ApiEnvelope<Map<String,Any>>
    @Streaming @GET("employee-documents/{id}/file") suspend fun employeeDocumentFile(@Path("id") id:String):Response<ResponseBody>
    @Streaming @GET("me/payroll/payslips/{id}/pdf") suspend fun payslipPdf(@Path("id") id: String): Response<ResponseBody>
    @GET("me/payroll/form16") suspend fun form16List(): ApiEnvelope<List<Form16Dto>>
    @Streaming @GET("me/payroll/form16/{id}/file") suspend fun form16File(@Path("id") id: String): Response<ResponseBody>
    @GET("me/assets") suspend fun myAssets(): ApiEnvelope<List<MyAssetDto>>
    @POST("me/assets/{id}/acknowledge") suspend fun acknowledgeAsset(@Path("id") id: String, @Body body: AssetAcknowledgeRequest): ApiEnvelope<Map<String, Boolean>>
    @POST("me/assets/{id}/return-request") suspend fun requestAssetReturn(@Path("id") id: String, @Body body: AssetReturnRequest): ApiEnvelope<Map<String, Boolean>>
    @POST("me/assets/{id}/report-issue") suspend fun reportAssetIssue(@Path("id") id: String, @Body body: AssetIssueRequest): ApiEnvelope<Map<String, Boolean>>
}
