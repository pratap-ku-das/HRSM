package com.orbithr.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.orbithr.app.core.model.WorkspaceSettingsDto

@Composable
fun NativeSettingsScreen(back:()->Unit,vm:SettingsViewModel=hiltViewModel()){
    val state by vm.state.collectAsState()
    Page("ADMINISTRATION","Workspace settings","Legal identity, registrations, business hours and policy defaults",action={
        Row{OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack,"Back",back);OrbitIconButton(Icons.Outlined.Refresh,"Refresh",vm::refresh)}
    }){
        StateBody(state,vm::refresh){loaded->
            var form by remember(loaded){mutableStateOf(loaded)}
            LazyColumn(verticalArrangement=Arrangement.spacedBy(10.dp),contentPadding=PaddingValues(bottom=28.dp)){
                state.error?.let{item{Text(it,color=OrbitRose)}}
                item{SettingsHeading("Legal identity")}
                item{SettingField("Company name",form.companyName){form=form.copy(companyName=it)}}
                item{SettingField("Legal entity name",form.legalEntityName){form=form.copy(legalEntityName=it)}}
                item{Text("Company type");LazyRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){items(listOf("PRIVATE_LIMITED","PUBLIC_LIMITED","LLP","PARTNERSHIP","PROPRIETORSHIP","TRUST","SOCIETY","OTHER")){value->FilterChip(selected=form.companyType==value,onClick={form=form.copy(companyType=value)},label={Text(value.replace('_',' '))})}}}
                item{SettingField("Registration number",form.registrationNumber){form=form.copy(registrationNumber=it)}}
                item{SettingField("Incorporation date YYYY-MM-DD",form.incorporationDate.orEmpty()){form=form.copy(incorporationDate=it.takeIf(String::isNotBlank))}}
                item{SettingsHeading("Tax and statutory registrations")}
                item{SettingField("GST / tax registration",form.taxRegistrationNumber){form=form.copy(taxRegistrationNumber=it)}}
                item{SettingField("PAN",form.panNumber){form=form.copy(panNumber=it.uppercase())}}
                item{SettingField("TAN",form.tanNumber){form=form.copy(tanNumber=it.uppercase())}}
                item{SettingField("Udyam registration",form.udyamRegistrationNumber){form=form.copy(udyamRegistrationNumber=it)}}
                item{SettingField("PF registration",form.pfRegistrationNumber){form=form.copy(pfRegistrationNumber=it)}}
                item{SettingField("ESI registration",form.esiRegistrationNumber){form=form.copy(esiRegistrationNumber=it)}}
                item{SettingField("Professional tax number",form.professionalTaxNumber){form=form.copy(professionalTaxNumber=it)}}
                item{SettingField("Labour license number",form.labourLicenseNumber){form=form.copy(labourLicenseNumber=it)}}
                item{SettingsHeading("Registered contact")}
                item{SettingField("Official email",form.officialEmail){form=form.copy(officialEmail=it)}}
                item{SettingField("Official phone",form.officialPhone){form=form.copy(officialPhone=it)}}
                item{SettingField("Website",form.website){form=form.copy(website=it)}}
                item{SettingField("Registered address",form.registeredAddress,false){form=form.copy(registeredAddress=it)}}
                item{SettingField("City",form.city){form=form.copy(city=it)}}
                item{SettingField("State",form.state){form=form.copy(state=it)}}
                item{SettingField("Country",form.country){form=form.copy(country=it)}}
                item{SettingField("Postal code",form.postalCode){form=form.copy(postalCode=it)}}
                item{SettingField("Industry",form.industry){form=form.copy(industry=it)}}
                item{SettingField("Company size",form.companySize){form=form.copy(companySize=it)}}
                item{SettingsHeading("Payroll and locale")}
                item{SettingField("Financial year start month",form.financialYearStartMonth.toString()){value->form=form.copy(financialYearStartMonth=value.toIntOrNull()?.coerceIn(1,12)?:form.financialYearStartMonth)}}
                item{SettingField("Currency",form.currency){form=form.copy(currency=it.uppercase().take(3))}}
                item{SettingField("Currency symbol",form.currencySymbol){form=form.copy(currencySymbol=it)}}
                item{SettingField("Timezone",form.timezone){form=form.copy(timezone=it)}}
                item{SettingsHeading("Working policy")}
                item{Text("Working days");LazyRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){items((0..6).toList()){day->val labels=listOf("Sun","Mon","Tue","Wed","Thu","Fri","Sat");FilterChip(selected=day in form.workDays,onClick={form=form.copy(workDays=if(day in form.workDays)form.workDays-day else (form.workDays+day).sorted())},label={Text(labels[day])})}}}
                item{SettingField("Business start HH:mm",form.businessHoursStart){form=form.copy(businessHoursStart=it)}}
                item{SettingField("Business end HH:mm",form.businessHoursEnd){form=form.copy(businessHoursEnd=it)}}
                item{SettingField("Default probation months",form.defaultProbationPeriodMonths.toString()){value->form=form.copy(defaultProbationPeriodMonths=value.toIntOrNull()?.coerceIn(0,36)?:form.defaultProbationPeriodMonths)}}
                item{SettingSwitch("Automatic overtime evaluation",form.enableAutomaticOvertime){form=form.copy(enableAutomaticOvertime=it)}}
                item{SettingSwitch("Audit logging enabled",form.enableAuditLogging){form=form.copy(enableAuditLogging=it)}}
                item{Button(onClick={vm.save(form)},modifier=Modifier.fillMaxWidth(),enabled=!state.loading&&form.companyName.length>=2&&form.legalEntityName.length>=2&&form.workDays.isNotEmpty()&&form.businessHoursEnd>form.businessHoursStart){Text(if(state.loading)"Saving..." else "Save workspace settings")}}
            }
        }
    }
}

@Composable private fun SettingsHeading(value:String)=Text(value,fontWeight=FontWeight.Bold,color=OrbitViolet)
@Composable private fun SettingField(label:String,value:String,singleLine:Boolean=true,update:(String)->Unit)=OutlinedTextField(value,update,Modifier.fillMaxWidth(),label={Text(label)},singleLine=singleLine,minLines=if(singleLine)1 else 3)
@Composable private fun SettingSwitch(label:String,checked:Boolean,update:(Boolean)->Unit)=Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(label);Switch(checked,update)}
