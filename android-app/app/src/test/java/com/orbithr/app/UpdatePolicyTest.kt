package com.orbithr.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    @Test fun newerReleaseIsOffered() {
        assertTrue(shouldOfferUpdate(installedVersionCode = 10, latestVersionCode = 11))
        assertTrue(shouldOfferUpdate(installedVersionCode = 27, latestVersionCode = 28))
    }

    @Test fun installedOrOlderReleaseIsNotOffered() {
        assertFalse(shouldOfferUpdate(installedVersionCode = 11, latestVersionCode = 11))
        assertFalse(shouldOfferUpdate(installedVersionCode = 28, latestVersionCode = 28))
        assertFalse(shouldOfferUpdate(installedVersionCode = 12, latestVersionCode = 11))
        assertFalse(shouldOfferUpdate(installedVersionCode = 30, latestVersionCode = 28))
    }

    @Test fun invalidVersionCodesAreSafelyRejected() {
        assertFalse(shouldOfferUpdate(installedVersionCode = 0, latestVersionCode = 10))
        assertFalse(shouldOfferUpdate(installedVersionCode = -1, latestVersionCode = 10))
        assertFalse(shouldOfferUpdate(installedVersionCode = 10, latestVersionCode = 0))
    }

    @Test fun mandatoryUpdatePolicyEvaluation() {
        assertTrue(isUpdateMandatory(installedVersionCode = 20, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 25, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 26, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 28, minSupportedVersionCode = null))
    }
}