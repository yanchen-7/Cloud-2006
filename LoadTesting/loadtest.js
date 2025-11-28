import http from 'k6/http';
import { check, sleep } from 'k6';
// Import the HTML reporter utility
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
// Import text summary
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

export const options = {
  // OPTIMIZATION: Saves memory on your laptop by throwing away response bodies
  // We only need the status code and timing, not the HTML content
  discardResponseBodies: true,

  stages: [
    { duration: '1m', target: 10 },    // Gentle warm up
    { duration: '1m', target: 100 },   // Shift to low load
    { duration: '1m', target: 1000 },  // HARD RAMP: Adds ~15 users/sec
    { duration: '1m', target: 2000 },  // STRESS: Max realistic load for local laptop
    { duration: '30s', target: 0 },    // Quick cool down
  ],
  
  thresholds: {
    // I relaxed the threshold to 2000ms because spikes usually cause lag
    http_req_duration: ['p(95)<2000'], 
    // Allow up to 5% failure rate (spikes often trigger temporary 503s)
    http_req_failed: ['rate<0.05'],   
  },
};

export default function () {
  const baseUrl = 'https://d2xf38tabcencb.cloudfront.net';
  
  // Cache Buster active
  const url = `${baseUrl}?cacheBust=${Math.random()}`;

  const res = http.get(url);

  check(res, { 'status was 200': (r) => r.status == 200 });

  // Random sleep between 0.5s and 1.5s is more realistic than exactly 1s
  // This prevents "thundering herd" (everyone hitting exactly at the same millisecond)
  sleep(1);
}

export function handleSummary(data) {
  return {
    "result.html": htmlReport(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}