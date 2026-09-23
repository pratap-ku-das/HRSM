package com.orbithr.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    @Test fun newerReleaseIsOffered() {
        assertTrue(shouldOfferUpdate(installedVersionCode = 10, latestVersionCode = 11))
    }

    @Test fun installedOrOlderReleaseIsNotOffered() {
        assertFalse(shouldOfferUpdate(installedVersionCode = 11, latestVersionCode = 11))
        assertFalse(shouldOfferUpdate(installedVersionCode = 12, latestVersionCode = 11))
    }
}