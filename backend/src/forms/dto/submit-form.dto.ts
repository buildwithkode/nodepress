// No DTO class needed — the submit endpoint accepts a flat JSON object of
// arbitrary form fields. Captcha token is read from the X-Captcha-Token header.
// Validation is handled inside SubmissionService against the form's field schema.
