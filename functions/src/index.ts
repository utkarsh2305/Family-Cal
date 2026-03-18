// Single entry point for all Cloud Functions.
// GCP deploys from the functions/ root; --entry-point selects which handler to run.
export { handler as parseEmail }        from './parse-email/index'
export { handler as calendarWebhook }   from './calendar-webhook/index'
export { handler as icloudSyncPoll }    from './icloud-sync-poll/index'
export { handler as notifyFamily }      from './notify-family/index'
