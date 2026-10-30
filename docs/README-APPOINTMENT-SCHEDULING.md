# Appointment Scheduling

How shoppers book in-boutique appointments with a trained advisor against Salesforce Scheduler.

## Overview

When a Salesforce Scheduler Core org is connected, the luxury vertical's boutiques page shows a real-time appointment wizard: the shopper picks a boutique, selects a service, and chooses an available slot. The wizard fetches live slot availability, blocks the advisor's calendar on booking, and sends a confirmation email — all from the Core org.

The feature is **opt-in** and **disabled by default**. Without a connected Core org, the wizard renders normally but shows a "contact by phone" fallback when no slots can be loaded — no broken states.

## Prerequisites

- Salesforce org with **Salesforce Scheduler** enabled (FSC Enterprise, Service Cloud, or Sales Cloud with Scheduler add-on)
- Core org provisioned from `storefront-datasets/luxury-core/` (see that directory's `README.md` for the full provisioning guide)
- B2C Commerce instance with the `sfnext-appointment` CAP installed, or BFF credentials configured

## Configuration

Set these environment variables (MRT environment or `.env` for local dev):

```bash
# Enable the feature (default: false)
PUBLIC__app__features__appointment__enabled=true

# Backend: 'scapi' uses the CAP Custom SCAPI (default); 'bff' routes directly to Core (dev/POC)
PUBLIC__app__features__appointment__provider=bff

# Minimum advance notice — slots starting sooner than this are hidden (default: 120 minutes)
# Corresponds to BM site preference sfnextAppointmentAdvanceNoticeMinutes
PUBLIC__app__features__appointment__advanceNoticeMinutes=120
```

When `provider=bff`, also set these server-only variables (never `PUBLIC__`):

```bash
PUBLIC__app__scheduler__enabled=true
PUBLIC__app__scheduler__myDomain=<core-org-my-domain>          # e.g. org.my.salesforce.com
PUBLIC__app__scheduler__clientId=<eca-consumer-key>
PUBLIC__app__scheduler__apiVersion=v68.0
PUBLIC__app__scheduler__workTypeGroupId=<from-seed-script>
PUBLIC__app__scheduler__parentRecordId=<anchor-account-id>
PUBLIC__app__scheduler__schedulingPolicyId=<from-seed-script>
SCHEDULER_CLIENT_SECRET=<eca-consumer-secret>                  # server-only

# OrgFarm/sandbox only — omit on production orgs with .my.salesforce.com domains
SCHEDULER_MYDOMAIN_ALLOWED_HOST=<non-standard-my-domain-host>
```

Territory IDs and WorkType IDs are resolved dynamically via External IDs (`StoreId__c`, `ServiceId__c`) — no Salesforce record IDs in config.

## Architecture

```
Storefront (browser)
  → GET /resource/appointment-availability   — real-time slot fetch
  → POST /resource/appointment-book          — booking

BFF (storefront Node server)
  → OAuth client-credentials → Salesforce Core org
  → GET /connect/scheduling/available-territory-slots
  → POST /sobjects/ServiceAppointment + /sobjects/AssignedResource
```

The Core org sends confirmation and cancellation emails via record-triggered Flows. Email fires for **any** status change — shopper-initiated or admin-originated — so the storefront is never in the notification loop.

## Core org provisioning

See **`storefront-datasets/luxury-core/README.md`** for the complete provisioning guide, including the one UI-only step (Scheduler PSL permission set) that cannot be scripted.

**Help Center:** [Salesforce Scheduler Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.salesforce_scheduler_dev.meta/salesforce_scheduler_dev/)
