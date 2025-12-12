# IMAP Provider Setup Guide

## Overview

MailAgent supports connecting to any email provider using the IMAP (Internet Message Access Protocol) and SMTP (Simple Mail Transfer Protocol) standards. This guide walks you through setting up a generic IMAP/SMTP provider.

## Supported Features

- **Email Sync**: Two-way synchronization with your IMAP server
- **Send Email**: Send emails via SMTP
- **Folder Support**: All IMAP folders are mapped to canonical types (INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE)
- **TLS/SSL**: Secure connections with configurable TLS settings
- **Test Connection**: Verify credentials before creating the provider

## Prerequisites

Before setting up an IMAP provider, you need:

1. **IMAP Server Details**:
   - IMAP hostname (e.g., `imap.example.com`)
   - IMAP port (usually `993` for TLS, `143` for non-TLS)
   - Your email username (usually your email address)
   - Your email password or app-specific password

2. **SMTP Server Details** (optional, for sending):
   - SMTP hostname (e.g., `smtp.example.com`)
   - SMTP port (usually `465` or `587` for TLS, `25` for non-TLS)
   - SMTP username (often same as IMAP username)
   - SMTP password (often same as IMAP password)

## Quick Setup with Provider Presets

MailAgent includes presets for popular email providers with pre-configured settings:

### Yahoo Mail
- **IMAP**: `imap.mail.yahoo.com:993` (TLS)
- **SMTP**: `smtp.mail.yahoo.com:465` (TLS)
- **Note**: Requires app-specific password (not your Yahoo account password)

### iCloud Mail
- **IMAP**: `imap.mail.me.com:993` (TLS)
- **SMTP**: `smtp.mail.me.com:587` (TLS)
- **Note**: Requires app-specific password (generate at appleid.apple.com)

### Fastmail
- **IMAP**: `imap.fastmail.com:993` (TLS)
- **SMTP**: `smtp.fastmail.com:465` (TLS)
- **Note**: Can use your regular password or app password

### AOL Mail
- **IMAP**: `imap.aol.com:993` (TLS)
- **SMTP**: `smtp.aol.com:587` (TLS)
- **Note**: Requires app-specific password

### Zoho Mail
- **IMAP**: `imap.zoho.com:993` (TLS)
- **SMTP**: `smtp.zoho.com:465` (TLS)
- **Note**: May need to enable IMAP in Zoho settings

### GMX
- **IMAP**: `imap.gmx.com:993` (TLS)
- **SMTP**: `smtp.gmx.com:587` (TLS)

### Aruba PEC (Italy)
- **IMAP**: `imaps.pec.aruba.it:993` (TLS)
- **SMTP**: `smtps.pec.aruba.it:465` (TLS)
- **Note**: For certified email (PEC) in Italy

## Step-by-Step Setup

### 1. Navigate to Provider Settings

1. Log in to MailAgent
2. Go to **Settings** → **Email Providers**
3. Click **Add IMAP Provider**

### 2. Choose Setup Method

#### Option A: Use a Preset (Recommended)

1. Click the **Quick Setup** dropdown
2. Select your email provider from the list
3. Server settings will be automatically filled
4. Enter your email address and password
5. Skip to step 4 (Test Connection)

#### Option B: Manual Configuration

1. Select **Custom / Other** from the Quick Setup dropdown
2. Fill in the IMAP server details manually
3. Fill in the SMTP server details (optional)

### 3. Configure IMAP Settings

Fill in the following fields:

- **Display Name**: A friendly name for this provider (e.g., "Work Email", "Personal Yahoo")
- **IMAP Host**: The IMAP server hostname
- **IMAP Port**: Default is `993` (TLS) or `143` (non-TLS)
- **IMAP Username**: Usually your full email address
- **IMAP Password**: Your email password or app-specific password
- **Use TLS**: Enable for secure connection (recommended)

### 4. Configure SMTP Settings (Optional)

If you want to send emails through this provider:

- **SMTP Host**: The SMTP server hostname
- **SMTP Port**: Default is `465` (TLS) or `587` (STARTTLS) or `25` (non-TLS)
- **SMTP Username**: Usually same as IMAP username
- **SMTP Password**: Usually same as IMAP password
- **Use TLS**: Enable for secure connection (recommended)

### 5. Test Connection

1. Click the **Test Connection** button
2. Wait for the test to complete
3. Review the results:
   - ✅ **IMAP Success**: Can receive emails
   - ✅ **SMTP Success**: Can send emails
   - ⚠️ **SMTP Skipped**: No SMTP host provided (receiving only)
   - ❌ **IMAP Failed**: Check your IMAP settings
   - ❌ **SMTP Failed**: Check your SMTP settings

### 6. Save Provider

1. If the test succeeds, click **Save** or **Add Provider**
2. MailAgent will begin syncing your emails immediately
3. Check the **Email** section to see your synced messages

## Common Issues and Troubleshooting

### Authentication Failed

**Symptoms**: "IMAP connection failed: Authentication failed"

**Solutions**:
- **Use app-specific password**: Many providers (Yahoo, iCloud, Gmail via IMAP) require app-specific passwords instead of your account password
- **Enable IMAP**: Check your email provider's settings to ensure IMAP access is enabled
- **Check username format**: Some providers require full email address, others just the username portion

### Connection Timeout

**Symptoms**: "IMAP connection failed: Timeout"

**Solutions**:
- **Check hostname**: Ensure the IMAP/SMTP hostname is correct (no typos)
- **Check port**: Verify the port number matches your provider's settings
- **Firewall**: Ensure your network allows connections to the IMAP/SMTP ports
- **VPN**: Some providers block connections from certain countries/IPs

### TLS/SSL Issues

**Symptoms**: "Certificate error" or "SSL handshake failed"

**Solutions**:
- **Try different ports**:
  - IMAP: Try port `993` (TLS) or `143` (STARTTLS/non-TLS)
  - SMTP: Try port `465` (TLS), `587` (STARTTLS), or `25` (non-TLS)
- **Disable TLS temporarily**: For testing only (not recommended for production)
- **Check certificate**: Some providers use self-signed certificates

### Slow Sync

**Symptoms**: Emails take a long time to appear

**Solutions**:
- **Large mailbox**: Initial sync of large mailboxes can take time
- **Check logs**: Look for sync errors in the application logs
- **Network speed**: Slow connections affect sync performance

### Missing Folders

**Symptoms**: Some folders don't appear in MailAgent

**Solutions**:
- **Folder mapping**: MailAgent maps IMAP folders to canonical types automatically
- **Special folders**: Sent, Drafts, Trash are detected by common names
- **Custom folders**: Create an issue if certain folders aren't syncing

## Security Best Practices

### Use App-Specific Passwords

Many email providers support app-specific passwords that:
- Can be revoked without changing your main password
- Have limited scope (e.g., only IMAP/SMTP access)
- Are more secure than using your main password

**How to generate**:
- **Yahoo**: Account Security → Generate app password
- **iCloud**: appleid.apple.com → App-Specific Passwords
- **Gmail**: Google Account → Security → 2-Step Verification → App passwords
- **Outlook.com**: Account Security → App passwords

### Enable Two-Factor Authentication

Even when using app-specific passwords, enable 2FA on your email account for maximum security.

### Use TLS

Always enable TLS for both IMAP and SMTP connections. This encrypts your email data in transit.

### Credential Storage

MailAgent stores your IMAP/SMTP passwords encrypted using AES-256-GCM encryption. Your passwords are never stored in plain text.

## Advanced Configuration

### Port Reference

| Protocol | Port | Security | Use Case |
|----------|------|----------|----------|
| IMAP | 143 | None/STARTTLS | Legacy or STARTTLS upgrade |
| IMAP | 993 | TLS | Standard secure IMAP (recommended) |
| SMTP | 25 | None | Legacy (not recommended) |
| SMTP | 587 | STARTTLS | Standard submission port |
| SMTP | 465 | TLS | Legacy SSL (still widely used) |

### Folder Mapping

MailAgent automatically maps IMAP folders to canonical types:

| IMAP Folder Name | Canonical Type |
|------------------|----------------|
| INBOX | INBOX |
| Sent, Sent Mail, Sent Items | SENT |
| Drafts | DRAFTS |
| Trash, Deleted, Deleted Items | TRASH |
| Spam, Junk | SPAM |
| Archive, All Mail | ARCHIVE |

Custom folder names are mapped based on common patterns and IMAP special-use attributes.

## API Reference

For developers integrating with MailAgent's API:

### Test Credentials

```http
POST /providers/generic/test
Content-Type: application/json

{
  "imapHost": "imap.example.com",
  "imapPort": 993,
  "imapUsername": "user@example.com",
  "imapPassword": "your-password",
  "imapUseTls": true,
  "smtpHost": "smtp.example.com",
  "smtpPort": 465,
  "smtpUsername": "user@example.com",
  "smtpPassword": "your-password",
  "smtpUseTls": true
}
```

**Response**:
```json
{
  "imap": {
    "success": true,
    "message": "IMAP connection successful"
  },
  "smtp": {
    "success": true,
    "message": "SMTP connection successful"
  }
}
```

### Create Generic Provider

```http
POST /providers/generic
Content-Type: application/json
Authorization: Bearer <your-jwt-token>

{
  "name": "My Email",
  "imapHost": "imap.example.com",
  "imapPort": 993,
  "imapUsername": "user@example.com",
  "imapPassword": "your-password",
  "imapUseTls": true,
  "smtpHost": "smtp.example.com",
  "smtpPort": 465,
  "smtpUsername": "user@example.com",
  "smtpPassword": "your-password",
  "smtpUseTls": true
}
```

## Support

If you encounter issues not covered in this guide:

1. Check the [EMAIL_DRIVER_ROADMAP.md](../development/EMAIL_DRIVER_ROADMAP.md) for known limitations
2. Review backend logs for detailed error messages
3. File an issue on the MailAgent GitHub repository

## Related Documentation

- [Email Driver Architecture](../development/EMAIL_DRIVER_ROADMAP.md)
- [Provider Integration Guide](../development/PROVIDERS_README.md)
- [OAuth Provider Setup](./OAUTH_PROVIDER_SETUP.md) (for Gmail/Microsoft)
