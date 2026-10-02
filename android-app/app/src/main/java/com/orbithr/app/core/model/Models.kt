package com.orbithr.app.core.model

import kotlinx.serialization.Serializable

@Serializable data class ApiEnvelope<T>(val data: T, val meta: ApiMeta = ApiMeta())
@Serializable data class ApiMeta(val requestId: String? = null, val page: Int? = null, val pageSize: Int? = null, val total: Int? = null, val totalPages: Int? = null)
@Serializable data class ApiErrorEnvelope(val error: ApiError, val meta: ApiMeta? = null)
@Serializable data class ApiError(val code: String, val message: String)
@Serializable data class SessionDto(val accessToken: String, val refreshToken: String, val expiresInSeconds: Int)
@Serializable data class LoginRequest(val email: String, val password: String, val deviceName: String? = null, val mfaCode:String?=null)
@Serializable data class EmailRequest(val email:String)
@Serializable data class TokenPasswordRequest(val token:String,val password:String)
@Serializable data class RefreshRequest(val refreshToken: String, val deviceName: String? = null)
@Serializable data class UserDto(val id: String, val email: String, val fullName: String, val role: String, val avatarUrl: String? = null, val permissions: List<String> = emptyList())
@Serializable data class CompanyDto(val id: String, val name: String, val email: String, val logoUrl: String? = null)
@Serializable data class DepartmentDto(val id: String, val name: String, val code: String)
@Serializable data class DesignationDto(val id: String, val title: String, val departmentId: String)
@Serializable data class EmployeeDto(val id: String, val employeeCode: String, val firstName: String, val lastName: String, val email: String, val phone: String? = null, val avatarUrl: String? = null, val status: String, val workLocation: String? = null, val workdayGpsTrackingEnabled:Boolean=false,val departmentId:String?=null,val designationId:String?=null,val reportingManagerId:String?=null,val dateOfJoining:String?=null,val employmentType:String="FULL_TIME",val department: DepartmentDto? = null, val designation: DesignationDto? = null)
@Serializable data class MeDto(val user: UserDto, val company: CompanyDto, val employee: EmployeeDto? = null)
@Serializable data class AndroidReleaseDto(val versionCode: Int, val versionName: String, val downloadUrl: String, val releaseNotes: String, val publishedAt: String)
@Serializable data class AnnouncementDto(val id: String, val title: String, val content: String, val priority: String, val createdAt: String)
@Serializable data class HolidayDto(val id: String, val name: String, val date: String, val type: String)
@Serializable data class DashboardDto(val activeEmployees: Int, val presentToday: Int, val pendingLeaves: Int, val announcements: List<AnnouncementDto>, val holidays: List<HolidayDto>)
@Serializable data class AttendanceDto(val id: String, val date: String, val status: String, val clockInTime: String? = null, val clockOutTime: String? = null, val source: String, val faceAuthVerified: Boolean = false, val locationLat: Double? = null, val locationLng: Double? = null,val workdayGpsTrackingEnabled:Boolean=false)
@Serializable data class TrackingStatusDto(val enabled:Boolean,val active:Boolean,val attendanceRecordId:String?=null,val deviceId:String?=null)
@Serializable data class LocationPointRequest(val id:String,val latitude:Double,val longitude:Double,val accuracyMeters:Float,val speedMetersPerSecond:Float?=null,val bearingDegrees:Float?=null,val capturedAt:String)
@Serializable data class LocationBatchRequest(val deviceId:String,val points:List<LocationPointRequest>)
@Serializable data class LocationBatchResult(val accepted:Int)
@Serializable data class PunchRequest(val action: String, val latitude: Double, val longitude: Double, val locationAccuracyMeters: Float, val deviceId: String, val faceVerificationToken: String, val recordedAt: String? = null)
@Serializable data class FaceChallengeRequest(val action: String, val deviceId: String)
@Serializable data class FaceChallengeDto(val challengeId: String, val expiresInSeconds: Int)
@Serializable data class FaceVerificationDto(val faceVerificationToken: String, val similarity: Double? = null, val expiresInSeconds: Int)
data class AttendanceVerificationProof(val action: String, val faceVerificationToken: String, val similarity: Double?, val latitude: Double, val longitude: Double, val accuracyMeters: Float, val deviceId: String, val verifiedAtMillis: Long)
sealed interface AttendanceVerificationResult {
    data class Verified(val proof: AttendanceVerificationProof) : AttendanceVerificationResult
    data class Failed(val message: String) : AttendanceVerificationResult
}
@Serializable data class LeaveTypeDto(val id: String, val name: String, val code: String, val daysAllowedPerYear: Int, val isPaid: Boolean, val color: String)
@Serializable data class LeaveRequestDto(val id: String, val leaveTypeId: String, val startDate: String, val endDate: String, val totalDays: Double, val reason: String, val status: String, val leaveType: LeaveTypeDto? = null)
@Serializable data class LeaveBalanceDto(val leaveTypeId: String, val year: Int, val entitlement: Double, val used: Double, val available: Double)
@Serializable data class LeavesDto(val requests: List<LeaveRequestDto>, val types: List<LeaveTypeDto>, val balances: List<LeaveBalanceDto> = emptyList())
@Serializable data class ApplyLeaveRequest(val leaveTypeId: String, val startDate: String, val endDate: String, val reason: String)
@Serializable data class PayslipComponentMetaDto(val name: String, val kind: String)
@Serializable data class PayslipDto(
    val id: String,
    val month: String,
    val grossSalary: Double,
    val totalDeductions: Double,
    val netSalary: Double,
    val status: String,
    val paymentDate: String? = null,
    val basicSalary: Double = 0.0,
    val hra: Double = 0.0,
    val allowances: Double = 0.0,
    val providentFund: Double = 0.0,
    val taxDeductions: Double = 0.0,
    val otherDeductions: Double = 0.0,
    val workingDays: Int = 0,
    val presentDays: Int = 0,
    val paidLeaveDays: Int = 0,
    val unpaidDays: Int = 0,
    val reimbursements: Double = 0.0,
    val employerContributions: Double = 0.0,
    val breakdown: Map<String, Double> = emptyMap(),
    val ytdBreakdown: Map<String, Double> = emptyMap(),
    val ytdGross: Double = 0.0,
    val ytdDeductions: Double = 0.0,
    val ytdNet: Double = 0.0,
    val componentMeta: Map<String, PayslipComponentMetaDto> = emptyMap(),
)
@Serializable data class ExpenseDto(val id: String, val title: String, val category: String, val amount: Double, val currency: String, val expenseDate: String, val status: String, val notes: String? = null)
@Serializable data class SubmitExpenseRequest(val title: String, val category: String, val amount: Double, val expenseDate: String, val notes: String? = null)
@Serializable data class OnboardEmployeeRequest(val employeeCode: String, val firstName: String, val lastName: String, val email: String, val departmentId: String, val designationId: String, val dateOfJoining: String, val employmentType: String = "FULL_TIME", val workLocation: String? = null, val phone: String? = null,val workdayGpsTrackingEnabled:Boolean=false)
@Serializable data class UpdateEmployeeRequest(val employeeCode:String,val firstName:String,val lastName:String,val email:String,val phone:String?=null,val departmentId:String,val designationId:String,val reportingManagerId:String?=null,val dateOfJoining:String,val employmentType:String="FULL_TIME",val workLocation:String?=null,val workdayGpsTrackingEnabled:Boolean=false)
@Serializable data class EmployeeLifecycleRequest(val status:String,val confirmationDate:String?=null,val probationEndDate:String?=null,val resignationDate:String?=null,val lastWorkingDay:String?=null)
@Serializable data class OnboardingDto(val employee: EmployeeDto, val emailDelivery: EmailDeliveryDto)
@Serializable data class OnboardingDraftDto(val id:String,val status:String,val progress:Int)
@Serializable data class SalaryStructureOptionDto(val id:String,val name:String,val code:String)
@Serializable data class PayrollRunMobileDto(val id:String,val month:String,val status:String,val totalEmployees:Int=0,val totalNetPayout:Double=0.0)
@Serializable data class PayrollAttendanceReviewMobileDto(val id:String,val employeeId:String,val workingDays:Double,val presentDays:Double,val absentDays:Double,val paidLeaveDays:Double,val unpaidLeaveDays:Double,val missingAttendanceDays:Double,val exceptions:List<String> = emptyList())
@Serializable data class PayrollConfigurationOptionDto(val structures:List<SalaryStructureOptionDto> = emptyList(),val runs:List<PayrollRunMobileDto> = emptyList())
@Serializable data class CreatePayrollRunRequest(val month:String)
@Serializable data class PayrollConfirmationRequest(val confirmation:Boolean=true,val reason:String?=null)
@Serializable data class PayrollDecisionRequest(val remarks:String?=null,val reason:String?=null)
@Serializable data class PersonalOnboardingSection(val firstName:String,val middleName:String?=null,val lastName:String,val gender:String,val dateOfBirth:String,val bloodGroup:String?=null,val personalEmail:String,val mobileNumber:String,val alternateMobileNumber:String?=null,val fatherName:String?=null,val motherName:String?=null,val maritalStatus:String?=null,val nationality:String="Indian",val currentAddress:String,val permanentAddress:String,val city:String,val state:String,val country:String="India",val pinCode:String,val emergencyContactName:String,val emergencyContactNumber:String,val emergencyContactRelationship:String)
@Serializable data class OnboardingDocumentDto(val documentType:String,val documentNumber:String?=null,val title:String,val objectKey:String,val fileName:String,val mimeType:String,val sizeBytes:Int,val issueDate:String?=null,val expiryDate:String?=null,val verificationRemarks:String?=null)
data class PendingOnboardingDocument(val documentType:String,val title:String,val fileName:String,val mimeType:String,val bytes:ByteArray)
@Serializable data class DocumentsOnboardingSection(val documents:List<OnboardingDocumentDto> = emptyList())
@Serializable data class SalaryOnboardingSection(val structureId:String,val annualCtc:Double,val effectiveFrom:String,val reason:String="Initial salary")
@Serializable data class FaceOnboardingSection(val required:Boolean=false,val status:String="NOT_REGISTERED")
@Serializable data class AdditionalOnboardingSection(val employeeCode:String,val workEmail:String,val departmentId:String,val designationId:String,val reportingManagerId:String?=null,val employmentType:String="FULL_TIME",val workLocation:String?=null,val workdayGpsTrackingEnabled:Boolean=false,val dateOfJoining:String,val probationPeriodMonths:Int=3,val weeklyOff:List<Int> = listOf(0,6),val skills:List<String> = emptyList())
data class MobileOnboardingRequest(val personal:PersonalOnboardingSection,val documents:List<PendingOnboardingDocument> = emptyList(),val salary:SalaryOnboardingSection,val face:FaceOnboardingSection=FaceOnboardingSection(),val additional:AdditionalOnboardingSection)
@Serializable data class EmailDeliveryDto(val id: String, val status: String)
@Serializable data class AttendanceRequestDto(val id: String, val type: String, val startDate: String, val endDate: String, val requestedClockIn: String? = null, val requestedClockOut: String? = null, val reason: String, val status: String, val workflowInstanceId: String? = null, val createdAt: String)
@Serializable data class CreateAttendanceRequest(val type: String, val startDate: String, val endDate: String, val reason: String, val requestedClockIn: String? = null, val requestedClockOut: String? = null)
@Serializable data class WorkflowInstanceDto(val id: String, val module: String, val title: String, val summary: String? = null, val status: String, val submittedAt: String)
@Serializable data class WorkflowStepDto(val id: String, val sequence: Int, val name: String)
@Serializable data class ApprovalInboxDto(val id: String, val sequence: Int, val status: String, val dueAt: String? = null, val approvals: Int, val minimumApprovals: Int, val step: WorkflowStepDto, val instance: WorkflowInstanceDto)
@Serializable data class WorkflowActionRequest(val action: String, val comment: String? = null)
@Serializable data class WorkflowActionResult(val status: String, val approvals: Int? = null)
@Serializable data class BreakSessionDto(val id: String, val employeeId: String, val date: String, val startedAt: String, val endedAt: String? = null)
@Serializable data class NotificationDto(val id: String, val eventKey: String, val title: String, val body: String, val entityType: String? = null, val entityId: String? = null, val actionUrl: String? = null, val readAt: String? = null, val createdAt: String)
@Serializable data class NotificationPreferenceDto(val id: String? = null, val eventKey: String, val channel: String, val enabled: Boolean)
@Serializable data class MobileDocumentDto(val id:String,val documentType:String,val title:String,val fileName:String,val expiryDate:String?=null,val verificationStatus:String,val createdAt:String)
@Serializable data class MobileAssetDto(val id:String,val name:String,val category:String,val serialNumber:String,val status:String,val condition:String,val assignedDate:String?=null)
@Serializable data class MobileGoalDto(val id:String,val title:String,val category:String,val targetDate:String,val progress:Double,val status:String)
@Serializable data class MobileReviewCycleDto(val name:String,val endsAt:String)
@Serializable data class MobileReviewDto(val id:String,val status:String,val overallRating:Double?=null,val goalRating:Double?=null,val competencyRating:Double?=null,val summary:String?=null,val cycle:MobileReviewCycleDto)
@Serializable data class ServiceRequestDto(val id:String,val type:String,val title:String,val reason:String,val amount:Double?=null,val status:String,val createdAt:String)
@Serializable data class CreateServiceRequest(val type:String,val title:String,val reason:String,val amount:Double?=null,val payload:Map<String,String>?=null)
@Serializable data class MobileWorkspaceDto(val documents:List<MobileDocumentDto>,val assets:List<MobileAssetDto>,val goals:List<MobileGoalDto>,val reviews:List<MobileReviewDto> = emptyList(),val serviceRequests:List<ServiceRequestDto> = emptyList())
@Serializable data class PushDeviceRequest(val token:String,val deviceName:String?=null,val appVersionCode:Int?=null,val appVersionName:String?=null)
data class OpenedDocument(val uri:String,val mimeType:String,val fileName:String)
@Serializable data class MfaStatusDto(val enabled:Boolean,val verifiedAt:String?=null)
@Serializable data class MfaSetupDto(val secret:String,val otpauthUri:String)
@Serializable data class MfaCodeRequest(val code:String)
@Serializable data class MfaDisableDto(val enabled:Boolean,val reauthenticationRequired:Boolean=false)
@Serializable data class SecuritySessionDto(val id:String,val deviceName:String?=null,val ipAddress:String?=null,val userAgent:String?=null,val createdAt:String,val lastUsedAt:String?=null,val expiresAt:String)
@Serializable data class LoginHistoryDto(val id:String,val email:String,val success:Boolean,val reason:String?=null,val ipAddress:String,val createdAt:String)
data class SecurityWorkspace(val mfa:MfaStatusDto,val sessions:List<SecuritySessionDto>,val history:List<LoginHistoryDto>,val setup:MfaSetupDto?=null,val reauthenticationRequired:Boolean=false)
@Serializable data class CompanyDocumentDto(val id:String,val title:String,val category:String,val fileName:String?=null,val mimeType:String?=null,val sizeBytes:Int?=null,val uploadedAt:String?=null)
@Serializable data class AuditLogDto(val id:String,val action:String,val category:String,val details:String,val timestamp:String)
@Serializable data class OperationsWorkspaceDto(val assets:List<MobileAssetDto> = emptyList(),val expenses:List<ExpenseDto> = emptyList(),val holidays:List<HolidayDto> = emptyList(),val announcements:List<AnnouncementDto> = emptyList(),val documents:List<CompanyDocumentDto> = emptyList(),val auditLogs:List<AuditLogDto> = emptyList(),val canManage:Boolean=false,val canReadAllAudit:Boolean=false)
data class PendingFile(val title:String,val category:String,val fileName:String,val mimeType:String,val bytes:ByteArray)
@Serializable data class WorkspaceSettingsDto(
    val companyName:String="Company",val legalEntityName:String="Company",val taxRegistrationNumber:String="",val companyType:String="PRIVATE_LIMITED",
    val registrationNumber:String="",val incorporationDate:String?=null,val panNumber:String="",val tanNumber:String="",val udyamRegistrationNumber:String="",
    val pfRegistrationNumber:String="",val esiRegistrationNumber:String="",val professionalTaxNumber:String="",val labourLicenseNumber:String="",
    val officialEmail:String="",val officialPhone:String="",val website:String="",val registeredAddress:String="",val city:String="",val state:String="",
    val country:String="India",val postalCode:String="",val industry:String="",val companySize:String="",val financialYearStartMonth:Int=4,
    val currency:String="INR",val currencySymbol:String="INR",val timezone:String="Asia/Kolkata",val workDays:List<Int> = listOf(1,2,3,4,5),
    val businessHoursStart:String="09:30",val businessHoursEnd:String="18:30",val enableAutomaticOvertime:Boolean=true,
    val enableAuditLogging:Boolean=true,val defaultProbationPeriodMonths:Int=3
)

@Serializable
data class Form16Dto(
    val id: String,
    val financialYear: String,
    val documentKey: String,
    val publishedAt: String? = null,
    val generatedAt: String? = null
)

@Serializable
data class MyAssetDto(
    val id: String,
    val name: String,
    val category: String,
    val serialNumber: String,
    val assignedDate: String? = null,
    val purchaseDate: String? = null,
    val status: String,
    val condition: String,
    val isAcknowledged: Boolean = false,
    val acknowledgedAt: String? = null,
    val hasPendingReturn: Boolean = false,
    val hasPendingIssue: Boolean = false,
    val returnRequestStatus: String? = null
)

@Serializable
data class AssetAcknowledgeRequest(
    val notes: String? = null,
    val deviceInfo: String? = null
)

@Serializable
data class AssetReturnRequest(
    val reason: String,
    val condition: String? = null
)

@Serializable
data class AssetIssueRequest(
    val issueDescription: String,
    val severity: String = "MEDIUM"
)

