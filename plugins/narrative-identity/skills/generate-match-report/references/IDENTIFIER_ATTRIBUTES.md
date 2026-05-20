# Identifier attribute IDs

Hand-curated subset of the Rosetta Stone attribute catalog. The IDs
in this list are the **identifier-typed** attributes — the columns
whose values are meant to identify a person, device, or household
across systems.

This skill uses the set to partition any access rule's mappings into
three buckets: identifiers (join-able), demographics (enrichment),
and `graph_edge` (the structural container).

## The set

```
11   ip_address
15   untyped_unique_id
39   telephone_number
69   apple_idfa
70   android_advertising_id
71   ttd_id
74   md5_hashed_email
75   sha1_hashed_email
76   sha256_hashed_email
77   hashed_email
78   narrative_cookie
79   nielsen_imr_id
80   liveintent_id
109  criteo_hmac_id
116  twitter_handle_id
118  raw_email
146  dms_id
233  disqus_id
251  narrative_id
259  sha256_hashed_phone_number
260  e164_phone_number
280  person_id
281  household_id
286  itil_ci_id
291  normalized_email
294  hashed_person_name
346  untyped_device_id
369  sha256_hashed_phone_number_nsn
```

`362` (`graph_edge`) is the structural container; it's neither an
identifier nor enrichment. Treat it separately.

## Partition pseudocode

```python
for m in ar.mappings:
    if m.attribute_name.startswith("_nio_"):
        continue                              # internal — skip
    elif m.attribute_id == 362:
        graphEdge = m                         # structural
    elif m.attribute_id in IDENTIFIER_ATTRIBUTE_IDS:
        identifiers.append(m)                 # join-able
    else:
        demographics.append(m)                # enrichment
```

## Maintenance

This set is hand-curated against the live catalog. When new
identifier-typed attributes ship in Rosetta Stone, add their IDs
here. The canonical source is `/find-attribute` against the live
attribute service; if a query against that service disagrees with
this list, trust the service and update this file.
