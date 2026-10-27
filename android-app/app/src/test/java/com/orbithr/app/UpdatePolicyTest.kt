package com.orbithr.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

class UpdatePolicyTest {

    // =========================================================================
    // 1. Update Offer Policy & Anti-Downgrade
    // =========================================================================

    @Test
    fun newerReleaseIsOffered() {
        assertTrue(shouldOfferUpdate(installedVersionCode = 10, latestVersionCode = 11))
        assertTrue(shouldOfferUpdate(installedVersionCode = 27, latestVersionCode = 28))
        assertTrue(shouldOfferUpdate(installedVersionCode = 28, latestVersionCode = 29))
    }

    @Test
    fun installedOrOlderReleaseIsNotOffered() {
        assertFalse(shouldOfferUpdate(installedVersionCode = 11, latestVersionCode = 11))
        assertFalse(shouldOfferUpdate(installedVersionCode = 28, latestVersionCode = 28))
        assertFalse(shouldOfferUpdate(installedVersionCode = 12, latestVersionCode = 11))
        assertFalse(shouldOfferUpdate(installedVersionCode = 30, latestVersionCode = 28))
    }

    @Test
    fun invalidVersionCodesAreSafelyRejected() {
        assertFalse(shouldOfferUpdate(installedVersionCode = 0, latestVersionCode = 10))
        assertFalse(shouldOfferUpdate(installedVersionCode = -1, latestVersionCode = 10))
        assertFalse(shouldOfferUpdate(installedVersionCode = 10, latestVersionCode = 0))
        assertFalse(shouldOfferUpdate(installedVersionCode = -5, latestVersionCode = -1))
        assertFalse(shouldOfferUpdate(installedVersionCode = 0, latestVersionCode = 0))
    }

    @Test
    fun mandatoryUpdatePolicyEvaluation() {
        assertTrue(isUpdateMandatory(installedVersionCode = 20, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 25, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 26, minSupportedVersionCode = 25))
        assertFalse(isUpdateMandatory(installedVersionCode = 28, minSupportedVersionCode = null))
    }

    // =========================================================================
    // 2. Package Name Verification
    // =========================================================================

    @Test
    fun packageNameVerificationAcceptsExactMatch() {
        assertTrue(validatePackageName("com.orbithr.app", "com.orbithr.app"))
    }

    @Test
    fun packageNameVerificationRejectsMismatchedOrRoguePackage() {
        assertFalse(validatePackageName("com.rogue.app", "com.orbithr.app"))
        assertFalse(validatePackageName("com.orbithr.app.fake", "com.orbithr.app"))
        assertFalse(validatePackageName("com.orbithr", "com.orbithr.app"))
    }

    @Test
    fun packageNameVerificationRejectsNullOrBlankInputs() {
        assertFalse(validatePackageName(null, "com.orbithr.app"))
        assertFalse(validatePackageName("", "com.orbithr.app"))
        assertFalse(validatePackageName("   ", "com.orbithr.app"))
        assertFalse(validatePackageName("com.orbithr.app", ""))
        assertFalse(validatePackageName("com.orbithr.app", "   "))
    }

    // =========================================================================
    // 3. Version Code Verification (Archive vs Expected vs Installed)
    // =========================================================================

    @Test
    fun versionCodeVerificationAcceptsValidUpgrade() {
        // Archive 29 matches expected 29 and is strictly greater than installed 28
        assertTrue(validateVersionCode(archiveVersionCode = 29L, expectedVersionCode = 29, installedVersionCode = 28))
    }

    @Test
    fun versionCodeVerificationRejectsExpectedMismatch() {
        // Archive 28 does not match advertised release 29
        assertFalse(validateVersionCode(archiveVersionCode = 28L, expectedVersionCode = 29, installedVersionCode = 27))
        // Archive 30 does not match advertised release 29
        assertFalse(validateVersionCode(archiveVersionCode = 30L, expectedVersionCode = 29, installedVersionCode = 28))
    }

    @Test
    fun versionCodeVerificationRejectsDowngradeOrReinstall() {
        // Attempting to install older version (downgrade)
        assertFalse(validateVersionCode(archiveVersionCode = 27L, expectedVersionCode = 27, installedVersionCode = 28))
        // Attempting to reinstall same version
        assertFalse(validateVersionCode(archiveVersionCode = 28L, expectedVersionCode = 28, installedVersionCode = 28))
    }

    @Test
    fun versionCodeVerificationRejectsZeroOrNegativeVersions() {
        assertFalse(validateVersionCode(archiveVersionCode = 0L, expectedVersionCode = 0, installedVersionCode = 0))
        assertFalse(validateVersionCode(archiveVersionCode = -1L, expectedVersionCode = -1, installedVersionCode = 10))
        assertFalse(validateVersionCode(archiveVersionCode = 10L, expectedVersionCode = -1, installedVersionCode = 5))
    }

    // =========================================================================
    // 4. SHA-256 Digest Validation
    // =========================================================================

    @Test
    fun sha256DigestComparisonMatchesExactAndCaseInsensitive() {
        val hash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fb"
        val uppercaseHash = hash.uppercase()
        val mixedCaseHash = "C426c957406470587FBB369b353785bce482b31d3f54c20375fd21ab506264fb"

        assertTrue(validateSha256(hash, hash))
        assertTrue(validateSha256(hash, uppercaseHash))
        assertTrue(validateSha256(hash, mixedCaseHash))
        assertTrue(validateSha256(hash, "  $hash  "))
    }

    @Test
    fun sha256DigestComparisonRejectsTamperedOrMismatched() {
        val hash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fb"
        val tampered = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fa"

        assertFalse(validateSha256(hash, tampered))
    }

    @Test
    fun sha256DigestComparisonRejectsMalformedLength() {
        val validHash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fb"
        val shortHash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264f" // 63 chars
        val longHash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fbaa" // 66 chars

        assertFalse(validateSha256(validHash, shortHash))
        assertFalse(validateSha256(validHash, longHash))
        assertFalse(validateSha256(shortHash, validHash))
    }

    @Test
    fun sha256DigestComparisonRejectsNullOrBlank() {
        val validHash = "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fb"

        assertFalse(validateSha256(validHash, null))
        assertFalse(validateSha256(validHash, ""))
        assertFalse(validateSha256(validHash, "   "))
        assertFalse(validateSha256("", validHash))
        assertFalse(validateSha256("   ", validHash))
    }

    // =========================================================================
    // 5. Certificate Continuity & Signing Lineage
    // =========================================================================

    @Test
    fun certificateMatchingAcceptsIdenticalCertificate() {
        val certA = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
        val certB = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)

        assertTrue(matchCertificateBytes(listOf(certA), listOf(certB)))
    }

    @Test
    fun certificateMatchingAcceptsLineageOrMultipleSigners() {
        val oldCert = byteArrayOf(10, 20, 30)
        val rotatedCert = byteArrayOf(40, 50, 60)
        val archiveCert = byteArrayOf(40, 50, 60)

        // Installed app history contains oldCert and rotatedCert; archive signed with rotatedCert
        assertTrue(matchCertificateBytes(listOf(archiveCert), listOf(oldCert, rotatedCert)))
        // Multiple signers on archive
        assertTrue(matchCertificateBytes(listOf(byteArrayOf(99), archiveCert), listOf(rotatedCert)))
    }

    @Test
    fun certificateMatchingRejectsMismatchedOrUntrustedCertificate() {
        val legitimateCert = byteArrayOf(1, 2, 3, 4)
        val attackerCert = byteArrayOf(5, 6, 7, 8)

        assertFalse(matchCertificateBytes(listOf(attackerCert), listOf(legitimateCert)))
    }

    @Test
    fun certificateMatchingRejectsEmptyCertLists() {
        val cert = byteArrayOf(1, 2, 3)

        assertFalse(matchCertificateBytes(emptyList(), listOf(cert)))
        assertFalse(matchCertificateBytes(listOf(cert), emptyList()))
        assertFalse(matchCertificateBytes(emptyList(), emptyList()))
    }

    // =========================================================================
    // 6. Download Progress Semantics
    // =========================================================================

    @Test
    fun indeterminateProgressWhenContentLengthIsUnknown() {
        val unknownContentLength = -1L
        val bytesRead = 1048576L // 1 MB downloaded

        val progress = if (unknownContentLength > 0) {
            (bytesRead.toFloat() / unknownContentLength).coerceIn(0f, 1f)
        } else {
            -1f
        }

        assertTrue(progress < 0f)
        assertEquals(-1f, progress, 0.001f)
    }

    @Test
    fun determinateProgressWhenContentLengthIsKnown() {
        val knownLength = 10_000_000L
        val bytesRead = 5_000_000L

        val progress = if (knownLength > 0) {
            (bytesRead.toFloat() / knownLength).coerceIn(0f, 1f)
        } else {
            -1f
        }

        assertEquals(0.5f, progress, 0.001f)
    }
}