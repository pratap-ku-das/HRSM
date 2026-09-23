package com.orbithr.app.ui

import com.orbithr.app.core.model.UserDto

enum class MobileWorkspaceKind {
    EMPLOYEE,
    MANAGER,
    HR_ADMIN,
    SUPER_ADMIN,
}

fun UserDto.hasPermission(permission: String): Boolean = permission in permissions

fun UserDto.mobileWorkspaceKind(): MobileWorkspaceKind = when {
    role.equals("SUPER_ADMIN", ignoreCase = true) || hasPermission("rbac.manage") -> MobileWorkspaceKind.SUPER_ADMIN
    role.equals("HR_ADMIN", ignoreCase = true) || role.equals("ADMIN", ignoreCase = true) || hasPermission("employee.manage") -> MobileWorkspaceKind.HR_ADMIN
    hasPermission("employee.read.team") || hasPermission("attendance.read.team") || hasPermission("workflow.review") -> MobileWorkspaceKind.MANAGER
    else -> MobileWorkspaceKind.EMPLOYEE
}

fun UserDto.mobileWorkspaceTitle(): String = when (mobileWorkspaceKind()) {
    MobileWorkspaceKind.EMPLOYEE -> "MY WORKSPACE"
    MobileWorkspaceKind.MANAGER -> "MANAGER WORKSPACE"
    MobileWorkspaceKind.HR_ADMIN -> "WORKFORCE ADMINISTRATION"
    MobileWorkspaceKind.SUPER_ADMIN -> "ORGANIZATION CONTROL"
}

fun UserDto.canOpenPeopleDirectory(): Boolean =
    hasPermission("employee.read.team") || hasPermission("employee.read.all") || hasPermission("employee.manage")

fun UserDto.canSeeWorkforcePulse(): Boolean =
    hasPermission("employee.read.team") || hasPermission("employee.read.all") || hasPermission("employee.manage")