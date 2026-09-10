# The 147 columns, and where each one goes

**Generated, not written.** `src/test/iceImportColumnMap.test.ts` maps a row holding a probe
value in one column and nothing else, diffs the result against an entirely empty row, and
records every field that changed. The test then asserts this file matches — so it cannot go
stale without CI saying so. Regenerate with:

```
UPDATE_COLUMN_MAP=1 npx vitest run src/test/iceImportColumnMap.test.ts
```

Columns: **147** · mapped **94** · read only as a fallback **5** · kept in raw only **44** · discarded **4**

Three things the numbering shows that a name-keyed table cannot: `Membership Type`
appears three times, `Policy Number` twice and `Company` twice. The column number is the
position in the export (0-based), and the destinations tell you which occurrence is read.

Column names are as `normaliseHeader` sees them: the export carries stray whitespace
(`Allergies `, `Nationality `, `Contact  1 - Tel` with a double space) and it is collapsed
once on read, so the table reads the way the column reads.

Four columns changed hands on **2026-09-10**, by Lee's ruling on `PENDING_FOR_LEE.md`
D-19 item 4: `Dob` became the fallback for `date_of_birth` when `Birthday` is blank (the
same DD/MM parser, so an ambiguous value is still refused); `Spouse` became a member note
and a couple-plan hint only; `Contact Friend for Email` became the member's email
notification consent, written **only** on an unambiguous yes; and `Wellbeing Appt Date`
stayed in raw deliberately. The other 43 unmapped columns stayed as they were.

`address_line_1` is `House Number` + `Home Street`, in that order — an ambulance is given
line 1, and a house number sitting on line 2 is a number the driver may never see.

## Discarded before anything is stored

Not written to `members`, not written to `crm_contacts`, and **not kept in
`crm_import_rows.raw`** — the accessor returns an empty string for them and `raw()` omits
the keys, so there is no copy anywhere. Only the fact that a row HELD one is recorded, as
a count in the batch summary.

| # | Column |
|---|---|
| 118 | `Credit Card Details` |
| 119 | `20 Digit Bank No` |
| 126 | `Private Medical Details` |
| 128 | `Death Funeral Wishes` |

Payment columns that are read as a BOOLEAN only — "this row had payment data" — and never
for their value: `Credit Card Details`, `20 Digit Bank No`.

## Mapped

| # | Column | Destination |
|---|---|---|
| 0 | `id` | `member.crm_source_id`, `sourceId` |
| 1 | `First Name` | `member.first_name` |
| 2 | `Last Name` | `member.last_name` |
| 4 | `Title` | `member.title` |
| 7 | `Status` | `crmProfile.status`, `member.status`, `memberReady`, `target` |
| 8 | `Stage` | `crmProfile.stage` |
| 9 | `Referral Source` | `crmProfile.referral_source` |
| 11 | `Tags` | `crmProfile.tags`, `crmProfile.tags[]` |
| 13 | `Assigned` | `crmProfile.assigned_label` |
| 16 | `Recent notes` | `notes` |
| 19 | `Created at` | `member.crm_created_at` |
| 22 | `Phone (w)` | `extraPhones`, `extraPhones[]` |
| 23 | `Phone (m)` | `member.phone`, `memberReady` |
| 24 | `Phone (h)` | `extraPhones`, `extraPhones[]` |
| 48 | `Email (w)` | `extraEmails`, `extraEmails[]`, `member.email` |
| 49 | `Email (h)` | `member.email`, `memberReady` |
| 50 | `Email (o)` | `extraEmails`, `extraEmails[]` |
| 54 | `Nickname` | `member.nickname` |
| 55 | `Home Street` | `member.address_line_1` |
| 56 | `Home Street 2` | `member.address_line_2` |
| 57 | `Home City` | `member.city` |
| 58 | `Home State` | `member.province` |
| 59 | `Home County` | `member.county` |
| 60 | `Home Postal Code` | `member.postal_code` |
| 61 | `GPS Co-ordinates` | `member.gps_lat`, `member.gps_lng` |
| 62 | `Google Map Link` | `member.map_link` |
| 63 | `Important Medical Info` | `medical.additional_notes`, `member.special_instructions` |
| 64 | `Membership Type` | `subscription.billing_frequency`, `subscription.legacy_membership_label`, `subscription.plan_type` |
| 67 | `Critical Info` | `medical.additional_notes`, `member.special_instructions` |
| 68 | `NIE Number` | `member.nie_dni` |
| 69 | `AN/SS Number` | `member.an_ss_number` |
| 70 | `Passport` | `member.passport_number` |
| 71 | `Key Safe` | `access.key_safe_code` |
| 72 | `Nationality` | `member.nationality` |
| 73 | `Birthday` | `member.date_of_birth`, `memberReady` |
| 74 | `Gender` | `member.gender` |
| 75 | `Marital Status` | `member.marital_status` |
| 76 | `Spouse` | `spouse` |
| 77 | `Allergies` | `medical.allergies`, `medical.allergies[]` |
| 78 | `Languages Spoken` | `member.language_notes` |
| 79 | `Hearing Problems` | `medical.hearing_notes` |
| 80 | `Glasses` | `medical.vision_notes` |
| 81 | `Street` | `postalAddress.address_line_1` |
| 82 | `Street 2` | `postalAddress.address_line_1` |
| 83 | `City/Town` | `postalAddress.city` |
| 84 | `Region` | `postalAddress.province` |
| 85 | `Postal Code` | `postalAddress.postal_code` |
| 86 | `Contact 1 - Name` | `contacts[].contactName`, `contacts[].relationship` |
| 87 | `Contact 1 - Tel` | `contacts[].phone` |
| 88 | `Contact 2 - Name` | `contacts[].contactName`, `contacts[].contactType`, `contacts[].phone`, `contacts[].priorityOrder`, `contacts[].relationship` |
| 89 | `Contact 2 - Tel` | `contacts[].contactName`, `contacts[].contactType`, `contacts[].phone`, `contacts[].priorityOrder`, `contacts[].relationship` |
| 90 | `Contact 3 - Tel` | `contacts[].contactName`, `contacts[].contactType`, `contacts[].phone`, `contacts[].priorityOrder`, `contacts[].relationship` |
| 91 | `Contact 3 - Name` | `contacts[].contactName`, `contacts[].contactType`, `contacts[].phone`, `contacts[].priorityOrder`, `contacts[].relationship` |
| 92 | `Key Holder 1 - Name` | `contacts[].contactName` |
| 93 | `Key Holder 1 - Tel` | `contacts[].phone` |
| 94 | `Mobility` | `medical.mobility` |
| 95 | `Medical Condition 1` | `medical.medical_conditions[]` |
| 96 | `Medical Condition 2` | `medical.medical_conditions[]` |
| 97 | `Medical Condition 3` | `medical.medical_conditions[]` |
| 98 | `Medical Condition 4` | `medical.medical_conditions[]` |
| 99 | `Medical Condition 5` | `medical.medical_conditions[]` |
| 100 | `Meds Usage 1` | `medical.medications`, `medical.medications[]` |
| 101 | `Meds Usage 2` | `medical.medications`, `medical.medications[]` |
| 102 | `Meds Usage 3` | `medical.medications`, `medical.medications[]` |
| 103 | `Meds Usage 4` | `medical.medications`, `medical.medications[]` |
| 104 | `Meds Usage 5` | `medical.medications`, `medical.medications[]` |
| 105 | `Meds Usage 6` | `medical.medications`, `medical.medications[]` |
| 106 | `Meds Location` | `medical.meds_location` |
| 107 | `Meds Notes` | `medical.meds_notes` |
| 108 | `Location` | `medical.doctor_location` |
| 109 | `Blood Group` | `medical.blood_type` |
| 110 | `Doctors Name` | `medical.doctor_name` |
| 111 | `Doctors Number` | `medical.doctor_phone` |
| 112 | `Medical Centre` | `medical.hospital_preference` |
| 116 | `Monthly Fee` | `subscription.amount` |
| 117 | `DD or TVP` | `subscription.payment_arrangement` |
| 120 | `Notes` | `notes` |
| 121 | `Monthly Payment Date` | `subscription.monthly_payment_date` |
| 122 | `Unit Type` | `device.unit_type` |
| 123 | `Alarm Manufacturer` | `device.manufacturer` |
| 124 | `Alarm Type` | `device.device_type` |
| 125 | `Contact Friend for Email` | `emailContactConsent` |
| 127 | `Policy Number` | `medical.private_policy_number` |
| 129 | `Funeral Plan` | `endOfLife.funeral_plan` |
| 130 | `Policy Number` | `endOfLife.policy_number` |
| 131 | `Permission State` | `member.consent_state` |
| 134 | `Groups` | `crmProfile.groups`, `crmProfile.groups[]` |
| 135 | `Date Joined` | `subscription.start_date` |
| 136 | `Payment Type` | `subscription.billing_frequency` |
| 139 | `House Number` | `member.address_line_1` |
| 141 | `Debt or TVP` | `subscription.arrears_note` |
| 142 | `Personal Pendant` | `subscription.has_pendant` |
| 143 | `Pendant IMEI` | `device`, `device.device_type`, `device.docking_station_mac`, `device.imei`, `device.manufacturer`, `device.notes`, `device.sim_phone_number`, `device.unit_type` |
| 146 | `Watch or Pendant` | `device.device_type` |

## Read only as a fallback

These columns are read, but only when the column that usually supplies the field is
empty. Three of them are the duplicate headers: `Membership Type` appears three times and
the first occurrence that is not a bare number wins, so the second and third are read only
when the first is blank. `Joined Date` is the same relationship with `Date Joined`.

| # | Column | Destination when it is used |
|---|---|---|
| 5 | `Dob` | `member.date_of_birth` |
| 65 | `Joined Date` | `subscription`, `subscription.has_pendant`, `subscription.is_free_of_charge`, `subscription.start_date` |
| 66 | `Membership Type` | `subscription`, `subscription.billing_frequency`, `subscription.has_pendant`, `subscription.is_free_of_charge`, `subscription.legacy_membership_label`, `subscription.plan_type` |
| 114 | `Purchased Package` | `subscription`, `subscription.billing_frequency`, `subscription.has_pendant`, `subscription.is_free_of_charge`, `subscription.legacy_membership_label`, `subscription.plan_type` |
| 115 | `Membership Type` | `subscription`, `subscription.billing_frequency`, `subscription.has_pendant`, `subscription.is_free_of_charge`, `subscription.legacy_membership_label`, `subscription.plan_type` |

## Kept in `crm_import_rows.raw` only

Nothing reads these. They are not lost — every import keeps the whole row (minus the
discarded columns above) in `crm_import_rows.raw`, so anything here can be mapped later
without re-exporting from Karma. **If one of these matters, say which and it gets a
destination.**

| # | Column |
|---|---|
| 3 | `Background` |
| 6 | `Name` |
| 10 | `Industry` |
| 12 | `Department` |
| 14 | `Company` |
| 15 | `Company` |
| 17 | `Note last added at` |
| 18 | `Attachments` |
| 20 | `Updated at` |
| 21 | `Tasks` |
| 25 | `Fax` |
| 26 | `Twitter` |
| 27 | `Facebook` |
| 28 | `Linkedin` |
| 29 | `Google Talk` |
| 30 | `Google+` |
| 31 | `Skype` |
| 32 | `YouTube` |
| 33 | `Street (w)` |
| 34 | `City (w)` |
| 35 | `State (w)` |
| 36 | `Postal Code (w)` |
| 37 | `Country (w)` |
| 38 | `Street (h)` |
| 39 | `City (h)` |
| 40 | `State (h)` |
| 41 | `Postal Code (h)` |
| 42 | `Country (h)` |
| 43 | `Street (o)` |
| 44 | `City (o)` |
| 45 | `State (o)` |
| 46 | `Postal Code (o)` |
| 47 | `Country (o)` |
| 51 | `Url (w)` |
| 52 | `Url (h)` |
| 53 | `Url (o)` |
| 113 | `Wellbeing Appt Date` |
| 132 | `Lead Recieved` |
| 133 | `Created Date` |
| 137 | `Membership Information` |
| 138 | `Home Address` |
| 140 | `Postal Address (If Different)` |
| 144 | `Personal Information` |
| 145 | `Emergency Contacts` |

### Of those, the ones worth a decision

Everything above this line is derived by running the mapper. THIS list is a judgement —
which unmapped columns look like they matter — and the test only checks that each one is
genuinely unmapped, not that the reasoning is right. Say the word on any of them and it
gets a destination.

- **`Wellbeing Appt Date`** — if wellbeing appointments are still run, this is the schedule. Lee's ruling of 2026-09-10 left it in raw deliberately, rather than mapping a date nothing reads.
- **`Name`** — the full name, where the import uses `First Name` + `Last Name`. Only matters for rows where the split columns are empty and this one is not.
- **`Company`** — appears twice. Empty for a private client; may hold the residence for a partner one.
- **`Lead Recieved`** — when the enquiry arrived — the only record of how long somebody waited.

The rest are Karma's own layout artefacts (`Membership Information`, `Home Address`, `Postal Address (If Different)`, `Personal Information`, `Emergency Contacts` are section headings exported as columns), the work/other-address and social-media blocks
that a Spanish care client does not have, and Karma's own bookkeeping (`Attachments`,
`Tasks`, `Note last added at`, `Updated at`).
