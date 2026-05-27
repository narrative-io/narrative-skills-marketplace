Validate any NQL before executing it, submitting it in a workflow,
or displaying it to the user:

```
narrative_nql_validate(nql=<query>, data_plane_id=<plane>)
```

Pass `data_plane_id` matching the dataset's plane — without it, the
validator falls back to the company default plane and can report
spurious "Unknown Table" errors.

If validation fails:

1. Read the error message and pointer.
2. Fix using the cheat sheet at
   `plugins/narrative-common/skills/write-nql/references/NQL_VALIDATION_ERRORS.md`.
3. Re-validate. Repeat up to 3 times — but only if your skill
   *generates* the NQL. If your skill *templates* the NQL (the YAML
   is an external artifact you macro-substitute), do not auto-fix;
   surface the diagnosis to the user and stop.
4. After 3 failed attempts (generator) or any failed validation
   (templater), surface the latest error to the user **verbatim** —
   not paraphrased; the wording carries the locator info.

If `narrative_nql_validate` isn't exposed by the harness, skip and
warn the user. Do not substitute `narrative_nql_run`; it allocates
compute.
