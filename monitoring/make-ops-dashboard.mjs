// Builds monitoring/ops-dashboard.json: the "Radius · Live Operations" Cloud Monitoring
// dashboard used in the demo. One screen per architecture layer: Cloud Run, Firestore,
// Pub/Sub, Vertex AI (Gemini), Cloud Scheduler, plus SLOs, live logs and open incidents.
//
//   node monitoring/make-ops-dashboard.mjs > monitoring/ops-dashboard.json
//   gcloud monitoring dashboards create --project nearby-events-510418 --config-from-file monitoring/ops-dashboard.json
const P = 'nearby-events-510418';
const RUN = 'resource.type="cloud_run_revision" AND resource.label.service_name="nearby-events"';
const LOGM = (m) => `metric.type="logging.googleapis.com/user/${m}" AND resource.type="cloud_run_revision"`;
const SLO = (id) => `projects/${P}/services/radius-cloud-run/serviceLevelObjectives/${id}`;
const UPTIME = 'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" AND metric.label.check_id="nearby-events-health-7yUxI29KmOc"';

const q = (filter, aligner, period, reducer, groupBy = []) => ({
  timeSeriesFilter: { filter, aggregation: { alignmentPeriod: period, perSeriesAligner: aligner, ...(reducer ? { crossSeriesReducer: reducer, groupByFields: groupBy } : {}) } },
});
const ds = (query, plotType = 'LINE', legend) => ({ timeSeriesQuery: query, plotType, ...(legend ? { legendTemplate: legend } : {}) });
const chart = (title, dataSets, extra = {}) => ({ title, xyChart: { dataSets, ...extra } });
const card = (title, query, extra = {}) => ({ title, scorecard: { timeSeriesQuery: query, sparkChartView: { sparkChartType: 'SPARK_LINE' }, ...extra } });
const header = (title, subtitle) => ({ title, sectionHeader: { subtitle, dividerBelow: true } });

const tiles = [];
const put = (x, y, w, h, widget) => tiles.push({ xPos: x, yPos: y, width: w, height: h, widget });

put(0, 0, 12, 2, { title: 'Radius · Live Operations', text: { format: 'MARKDOWN', content: '**Every layer of the live architecture on one screen.** Top: health right now and the last 24 h. Then the SLOs and their error budgets, then one row per Google Cloud service (Cloud Run, Firestore, Pub/Sub, Vertex AI / Gemini, Cloud Scheduler), live logs and open incidents. Alerts email the team. Project `nearby-events-510418`, Cloud Run `nearby-events`, asia-south1.' } });

// Row 1: health right now
put(0, 2, 2, 3, card('Uptime checks passing (1 = 100%)', q(UPTIME, 'ALIGN_FRACTION_TRUE', '3600s', 'REDUCE_MEAN')));
put(2, 2, 2, 3, card('Requests · last hour', q(`metric.type="run.googleapis.com/request_count" AND ${RUN}`, 'ALIGN_SUM', '3600s', 'REDUCE_SUM')));
put(4, 2, 2, 3, card('Response time p95 (ms) · target < 500', q(`metric.type="run.googleapis.com/request_latencies" AND ${RUN}`, 'ALIGN_DELTA', '3600s', 'REDUCE_PERCENTILE_95'),
  { thresholds: [{ value: 500, color: 'YELLOW', direction: 'ABOVE' }, { value: 1500, color: 'RED', direction: 'ABOVE' }] }));
put(6, 2, 2, 3, card('Server errors (5xx) · last hour', q(`metric.type="run.googleapis.com/request_count" AND ${RUN} AND metric.label.response_code_class="5xx"`, 'ALIGN_SUM', '3600s', 'REDUCE_SUM'),
  { thresholds: [{ value: 1, color: 'RED', direction: 'ABOVE' }] }));
put(8, 2, 2, 3, card('Cloud Run instances now (scales to 0)', q(`metric.type="run.googleapis.com/container/instance_count" AND ${RUN}`, 'ALIGN_MAX', '60s', 'REDUCE_SUM')));
put(10, 2, 2, 3, card('Gemini calls · 24 h (Vertex AI)', q('metric.type="aiplatform.googleapis.com/publisher/online_serving/model_invocation_count" AND metric.label.method="GenerateContent"', 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));

// Row 2: what people did
put(0, 5, 2, 3, card('Events posted · 24 h', q(LOGM('events_created'), 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));
put(2, 5, 2, 3, card("RSVPs ('I'm Going') · 24 h", q(LOGM('rsvps_created'), 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));
put(4, 5, 2, 3, card('Notifications delivered (Pub/Sub) · 24 h', q('metric.type="pubsub.googleapis.com/subscription/push_request_count" AND resource.type="pubsub_subscription" AND metric.label.response_class="ack"', 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));
put(6, 5, 2, 3, card('Snap-a-Poster reads · 24 h', q(LOGM('poster_extractions'), 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));
put(8, 5, 2, 3, card('AI fallbacks / failures · 24 h', q(LOGM('ai_failures'), 'ALIGN_SUM', '86400s', 'REDUCE_SUM'), { thresholds: [{ value: 3, color: 'YELLOW', direction: 'ABOVE' }] }));
put(10, 5, 2, 3, card('Expiry sweeps (Cloud Scheduler) · 24 h', q(LOGM('expiry_sweeps'), 'ALIGN_SUM', '86400s', 'REDUCE_SUM')));

// Row 3: SLOs
put(0, 8, 12, 1, header('Service level objectives', 'Targets we hold ourselves to, measured over a rolling 28 days. The error budget is how much failure the target still allows.'));
put(0, 9, 3, 3, card('Availability SLO 99.5% · compliance', { timeSeriesFilter: { filter: `select_slo_compliance("${SLO('availability-99-5')}")` } }));
put(3, 9, 3, 3, card('Availability · error budget left (1 = all)', { timeSeriesFilter: { filter: `select_slo_budget_fraction("${SLO('availability-99-5')}")` } }));
put(6, 9, 3, 3, card('Latency SLO (95% < 500 ms) · compliance', { timeSeriesFilter: { filter: `select_slo_compliance("${SLO('latency-500ms-95')}")` } }));
put(9, 9, 3, 3, card('Latency · error budget left (1 = all)', { timeSeriesFilter: { filter: `select_slo_budget_fraction("${SLO('latency-500ms-95')}")` } }));

// Row 4: Cloud Run
put(0, 12, 12, 1, header('Compute · Cloud Run', 'Traffic, speed and how many copies of the server are running.'));
put(0, 13, 4, 4, chart('Requests per second by result', [ds(q(`metric.type="run.googleapis.com/request_count" AND ${RUN}`, 'ALIGN_RATE', '60s', 'REDUCE_SUM', ['metric.label.response_code_class']), 'STACKED_BAR')]));
put(4, 13, 4, 4, chart('Response time (ms) · p50 and p95 vs 500 ms target', [
  ds(q(`metric.type="run.googleapis.com/request_latencies" AND ${RUN}`, 'ALIGN_DELTA', '60s', 'REDUCE_PERCENTILE_50'), 'LINE', 'p50'),
  ds(q(`metric.type="run.googleapis.com/request_latencies" AND ${RUN}`, 'ALIGN_DELTA', '60s', 'REDUCE_PERCENTILE_95'), 'LINE', 'p95'),
], { thresholds: [{ value: 500, label: 'SLO target 500 ms' }] }));
put(8, 13, 4, 4, chart('Instances running (0 when idle = no cost)', [ds(q(`metric.type="run.googleapis.com/container/instance_count" AND ${RUN}`, 'ALIGN_MAX', '60s', 'REDUCE_SUM', ['metric.label.state']), 'STACKED_AREA')]));

// Row 5: data and messaging
put(0, 17, 12, 1, header('Data & messaging · Firestore and Pub/Sub', 'Database reads and writes; notification messages published and delivered.'));
put(0, 18, 4, 4, chart('Firestore document reads vs writes (per min)', [
  ds(q('metric.type="firestore.googleapis.com/document/read_count"', 'ALIGN_RATE', '60s', 'REDUCE_SUM'), 'LINE', 'reads'),
  ds(q('metric.type="firestore.googleapis.com/document/write_count"', 'ALIGN_RATE', '60s', 'REDUCE_SUM'), 'LINE', 'writes'),
]));
put(4, 18, 4, 4, chart('Pub/Sub notifications: published vs delivered', [
  ds(q('metric.type="pubsub.googleapis.com/topic/send_message_operation_count" AND resource.type="pubsub_topic"', 'ALIGN_SUM', '300s', 'REDUCE_SUM'), 'STACKED_BAR', 'published'),
  ds(q('metric.type="pubsub.googleapis.com/subscription/push_request_count" AND resource.type="pubsub_subscription"', 'ALIGN_SUM', '300s', 'REDUCE_SUM', ['metric.label.response_class']), 'STACKED_BAR', 'delivered (${metric.labels.response_class})'),
]));
put(8, 18, 4, 4, chart('Pub/Sub backlog: oldest undelivered message (s)', [ds(q('metric.type="pubsub.googleapis.com/subscription/oldest_unacked_message_age" AND resource.type="pubsub_subscription"', 'ALIGN_MAX', '60s', 'REDUCE_MAX'))]));

// Row 6: AI
put(0, 22, 12, 1, header('AI · Vertex AI (Gemini 3.5 Flash-Lite)', 'Gemini calls as Google sees them, tokens used, and how our app experienced them.'));
put(0, 23, 4, 4, chart('Gemini calls by response code', [ds(q('metric.type="aiplatform.googleapis.com/publisher/online_serving/model_invocation_count" AND metric.label.method="GenerateContent"', 'ALIGN_SUM', '300s', 'REDUCE_SUM', ['metric.label.response_code']), 'STACKED_BAR')]));
put(4, 23, 4, 4, chart('Gemini tokens: input vs output', [ds(q('metric.type="aiplatform.googleapis.com/publisher/online_serving/token_count"', 'ALIGN_SUM', '300s', 'REDUCE_SUM', ['metric.label.type']), 'STACKED_BAR')]));
put(8, 23, 4, 4, chart('AI health in the app (per hour)', [
  ds(q(LOGM('poster_extractions'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'Snap-a-Poster OK'),
  ds(q(LOGM('ai_retries'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'retried on fallback model'),
  ds(q(LOGM('ai_failures'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'failed / used rules'),
]));

// Row 7: activity and jobs
put(0, 27, 12, 1, header('Board activity & scheduled jobs', 'What residents and organisers did, and the hourly expiry job.'));
put(0, 28, 6, 4, chart('Events posted and RSVPs (per hour)', [
  ds(q(LOGM('events_created'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'events posted'),
  ds(q(LOGM('rsvps_created'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'RSVPs'),
]));
put(6, 28, 6, 4, chart('Cloud Scheduler expiry sweeps and server errors (per hour)', [
  ds(q(LOGM('expiry_sweeps'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'expiry sweeps'),
  ds(q(LOGM('app_errors'), 'ALIGN_SUM', '3600s', 'REDUCE_SUM'), 'STACKED_BAR', 'ERROR logs'),
]));

// Row 8: live logs and incidents
put(0, 32, 12, 1, header('Live', 'Key moments from the structured logs as they happen, and any open incident.'));
put(0, 33, 8, 7, {
  title: 'Live log: posts, RSVPs, notifications, AI, expiry, warnings',
  logsPanel: {
    filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="nearby-events" AND (jsonPayload.message=("Event created" OR "RSVP created" OR "Pub/Sub message published" OR "Notifications delivered" OR "Poster extraction complete" OR "Expiration sweep complete" OR "Gemini busy or slow, retrying once") OR severity>=WARNING)`,
    resourceNames: [`projects/${P}`],
  },
});
put(8, 33, 4, 7, { title: 'Open incidents (alert policies)', incidentList: {} });

console.log(JSON.stringify({ displayName: 'Radius · Live Operations', mosaicLayout: { columns: 12, tiles } }, null, 1));
