package com.orbithr.app.ui

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.orbithr.app.core.model.AdditionalOnboardingSection
import com.orbithr.app.core.model.MobileOnboardingRequest
import com.orbithr.app.core.model.OnboardingDto
import com.orbithr.app.core.model.PendingOnboardingDocument
import com.orbithr.app.core.model.PersonalOnboardingSection
import com.orbithr.app.core.model.SalaryOnboardingSection
import java.time.LocalDate

private val onboardingDocumentTypes = listOf(
    "AADHAAR", "PAN", "PASSPORT", "DRIVING_LICENCE", "VOTER_ID",
    "ADDRESS_PROOF", "EDUCATION_CERTIFICATE", "EXPERIENCE_CERTIFICATE",
    "BANK_DOCUMENT", "JOINING_DOCUMENT", "OTHER",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardWizardDialog(
    organization: LoadState<OrganizationOptions>,
    onboarding: LoadState<OnboardingDto>,
    dismiss: () -> Unit,
    retryOrganization: () -> Unit,
    submit: (MobileOnboardingRequest) -> Unit,
) {
    val context = LocalContext.current
    var step by remember { mutableIntStateOf(0) }
    var first by remember { mutableStateOf("") }; var last by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("") }; var genderOpen by remember { mutableStateOf(false) }; var dob by remember { mutableStateOf("") }
    var personalEmail by remember { mutableStateOf("") }; var mobile by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }; var city by remember { mutableStateOf("") }
    var region by remember { mutableStateOf("") }; var pin by remember { mutableStateOf("") }
    var emergencyName by remember { mutableStateOf("") }; var emergencyPhone by remember { mutableStateOf("") }
    var emergencyRelation by remember { mutableStateOf("") }
    var employeeCode by remember { mutableStateOf("") }; var workEmail by remember { mutableStateOf("") }
    var departmentId by remember { mutableStateOf("") }; var designationId by remember { mutableStateOf("") }
    var structureId by remember { mutableStateOf("") }; var annualCtc by remember { mutableStateOf("") }
    var gpsTrackingEnabled by remember { mutableStateOf(false) }
    var departmentOpen by remember { mutableStateOf(false) }; var designationOpen by remember { mutableStateOf(false) }
    var structureOpen by remember { mutableStateOf(false) }; var documentTypeOpen by remember { mutableStateOf(false) }
    var documentType by remember { mutableStateOf("AADHAAR") }; var documentError by remember { mutableStateOf<String?>(null) }
    val documents = remember { mutableStateListOf<PendingOnboardingDocument>() }
    val departments = organization.data?.departments.orEmpty()
    val designations = organization.data?.designations.orEmpty()
    val structures = organization.data?.salaryStructures.orEmpty()
    val availableDesignations = designations.filter { it.departmentId == departmentId }

    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val resolver = context.contentResolver
            val fileName = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            } ?: "Document"
            val mimeType = resolver.getType(uri) ?: "application/octet-stream"
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("The selected file could not be read.")
            require(bytes.size <= 20 * 1024 * 1024) { "Documents must be 20 MB or smaller." }
            documents += PendingOnboardingDocument(documentType, fileName.substringBeforeLast('.').ifBlank { "Document" }, fileName, mimeType, bytes)
            documentError = null
        }.onFailure { documentError = it.message }
    }

    LaunchedEffect(departments, structures) {
        if (departmentId.isBlank() && departments.size == 1) departmentId = departments.first().id
        if (structureId.isBlank() && structures.size == 1) structureId = structures.first().id
    }
    LaunchedEffect(departmentId) {
        if (availableDesignations.none { it.id == designationId }) designationId = ""
        if (availableDesignations.size == 1) designationId = availableDesignations.first().id
    }

    val personalReady = first.isNotBlank() && last.isNotBlank() && personalEmail.contains('@') && mobile.length >= 7 &&
        dob.isNotBlank() && gender.isNotBlank() && address.length >= 5 && city.length >= 2 && region.length >= 2 &&
        pin.length >= 3 && emergencyName.length >= 2 && emergencyPhone.length >= 7 && emergencyRelation.length >= 2
    val employmentReady = employeeCode.length >= 2 && workEmail.contains('@') && departmentId.isNotBlank() &&
        designationId.isNotBlank() && structureId.isNotBlank() && (annualCtc.toDoubleOrNull() ?: 0.0) > 0

    AlertDialog(
        onDismissRequest = dismiss,
        shape = RoundedCornerShape(28.dp),
        icon = { Icon(Icons.Outlined.PersonAdd, null, tint = OrbitViolet) },
        title = { Column { Text("Employee onboarding"); Text("Step ${step + 1} of 4", style = MaterialTheme.typography.labelSmall, color = OrbitMuted) } },
        text = {
            LazyColumn(Modifier.heightIn(max = 540.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                when (step) {
                    0 -> {
                        item { SectionLabel("Personal details") }
                        item { FormField("First name", first) { first = it } }; item { FormField("Last name", last) { last = it } }
                        item {
                            SelectField("Gender", gender, genderOpen, { genderOpen = it }) {
                                listOf("Male", "Female", "Other", "Prefer not to say").forEach { option ->
                                    DropdownMenuItem({ Text(option) }, { gender = option; genderOpen = false })
                                }
                            }
                        }
                        item { FormField("Date of birth (YYYY-MM-DD)", dob) { dob = it } }
                        item { FormField("Personal email", personalEmail) { personalEmail = it } }; item { FormField("Mobile number", mobile) { mobile = it } }
                        item { FormField("Current and permanent address", address) { address = it } }
                        item { FormField("City", city) { city = it } }; item { FormField("State", region) { region = it } }; item { FormField("PIN code", pin) { pin = it } }
                        item { FormField("Emergency contact", emergencyName) { emergencyName = it } }
                        item { FormField("Emergency phone", emergencyPhone) { emergencyPhone = it } }
                        item { FormField("Relationship", emergencyRelation) { emergencyRelation = it } }
                    }
                    1 -> {
                        item { SectionLabel("Documents") }
                        item { Text("Select the document name first, then choose the file. PDF, JPG, PNG, DOC and DOCX files up to 20 MB are supported.", style = MaterialTheme.typography.bodySmall, color = OrbitMuted) }
                        item {
                            SelectField("Document name", documentType.replace('_', ' '), documentTypeOpen, { documentTypeOpen = it }) {
                                onboardingDocumentTypes.forEach { type -> DropdownMenuItem({ Text(type.replace('_', ' ')) }, { documentType = type; documentTypeOpen = false }) }
                            }
                        }
                        item {
                            Button(
                                onClick = { documentPicker.launch(arrayOf("application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Icon(Icons.Outlined.UploadFile, null); Spacer(Modifier.width(7.dp)); Text("Choose and add document") }
                        }
                        documentError?.let { item { Text(it, color = OrbitRose, style = MaterialTheme.typography.bodySmall) } }
                        items(documents, key = { it.fileName + it.bytes.size }) { document ->
                            Surface(shape = RoundedCornerShape(16.dp), color = Color.White) {
                                Row(Modifier.fillMaxWidth().padding(12.dp)) {
                                    Icon(Icons.Outlined.Description, null, tint = OrbitViolet); Spacer(Modifier.width(9.dp))
                                    Column(Modifier.weight(1f)) { Text(document.documentType.replace('_', ' '), fontWeight = FontWeight.Bold); Text("${document.fileName} - ${document.bytes.size / 1024} KB", style = MaterialTheme.typography.bodySmall, color = OrbitMuted) }
                                    IconButton(onClick = { documents.remove(document) }) { Icon(Icons.Outlined.Delete, "Remove", tint = OrbitRose) }
                                }
                            }
                        }
                    }
                    2 -> {
                        item { SectionLabel("Employment and salary") }
                        item { FormField("Employee ID", employeeCode) { employeeCode = it } }; item { FormField("Work email", workEmail) { workEmail = it } }
                        item { SelectField("Department", departments.firstOrNull { it.id == departmentId }?.name.orEmpty(), departmentOpen, { departmentOpen = it }) { departments.forEach { department -> DropdownMenuItem({ Text(department.name) }, { departmentId = department.id; departmentOpen = false }) } } }
                        item { SelectField("Designation", availableDesignations.firstOrNull { it.id == designationId }?.title.orEmpty(), designationOpen, { designationOpen = it }) { availableDesignations.forEach { designation -> DropdownMenuItem({ Text(designation.title) }, { designationId = designation.id; designationOpen = false }) } } }
                        item { SelectField("Salary structure", structures.firstOrNull { it.id == structureId }?.name.orEmpty(), structureOpen, { structureOpen = it }) { structures.forEach { structure -> DropdownMenuItem({ Text(structure.name) }, { structureId = structure.id; structureOpen = false }) } } }
                        item { FormField("Annual CTC", annualCtc) { annualCtc = it.filter { char -> char.isDigit() || char == '.' } } }
                        item { Surface(shape=RoundedCornerShape(16.dp),color=OrbitViolet.copy(alpha=.08f)){Row(Modifier.fillMaxWidth().padding(13.dp)){Column(Modifier.weight(1f)){Text("Workday GPS route",fontWeight=FontWeight.Bold);Text("Track only from clock-in until clock-out",style=MaterialTheme.typography.bodySmall,color=OrbitMuted)};Switch(checked=gpsTrackingEnabled,onCheckedChange={gpsTrackingEnabled=it})}} }
                    }
                    else -> {
                        item { SectionLabel("Review and invite") }
                        item { Text("$first $last\n$employeeCode - $workEmail\n${departments.firstOrNull { it.id == departmentId }?.name} - ${availableDesignations.firstOrNull { it.id == designationId }?.title}\n${documents.size} document(s)\nAnnual CTC INR $annualCtc\nGPS route tracking: ${if(gpsTrackingEnabled) "ON" else "OFF"}") }
                        item { Surface(shape = RoundedCornerShape(14.dp), color = OrbitMint.copy(alpha = .1f)) { Text("Documents are uploaded securely before the employee is created. A one-time activation link is then emailed.", Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall) } }
                    }
                }
                organization.error?.let { item { Text(it, color = OrbitRose); TextButton(onClick = retryOrganization) { Text("Retry organization data") } } }
                onboarding.error?.let { item { Text(it, color = OrbitRose) } }
            }
        },
        confirmButton = {
            Button(
                enabled = !onboarding.loading && when (step) { 0 -> personalReady; 2 -> employmentReady; else -> true },
                onClick = {
                    if (step < 3) step++ else submit(
                        MobileOnboardingRequest(
                            personal = PersonalOnboardingSection(firstName = first, lastName = last, gender = gender, dateOfBirth = dob, personalEmail = personalEmail, mobileNumber = mobile, currentAddress = address, permanentAddress = address, city = city, state = region, pinCode = pin, emergencyContactName = emergencyName, emergencyContactNumber = emergencyPhone, emergencyContactRelationship = emergencyRelation),
                            documents = documents.toList(),
                            salary = SalaryOnboardingSection(structureId, annualCtc.toDouble(), LocalDate.now().toString()),
                            additional = AdditionalOnboardingSection(employeeCode, workEmail, departmentId, designationId, workdayGpsTrackingEnabled=gpsTrackingEnabled,dateOfJoining = LocalDate.now().toString()),
                        ),
                    )
                },
            ) { Text(if (onboarding.loading) "Creating..." else if (step < 3) "Continue" else "Create & invite") }
        },
        dismissButton = { TextButton(onClick = { if (step > 0) step-- else dismiss() }) { Text(if (step > 0) "Back" else "Cancel") } },
    )
}

@Composable private fun SectionLabel(value: String) = Text(value, fontWeight = FontWeight.Bold)

@Composable
private fun FormField(label: String, value: String, update: (String) -> Unit) {
    OutlinedTextField(value, update, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true, shape = RoundedCornerShape(15.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectField(label: String, value: String, expanded: Boolean, change: (Boolean) -> Unit, content: @Composable () -> Unit) {
    ExposedDropdownMenuBox(expanded, change) {
        OutlinedTextField(value, {}, readOnly = true, label = { Text(label) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) }, modifier = Modifier.menuAnchor().fillMaxWidth())
        DropdownMenu(expanded, { change(false) }) { content() }
    }
}
