/**
 * Model Benchmark: mistral-medium-latest vs mistral-small-latest
 * 50 hard real-world questions for a productivity/email AI assistant.
 *
 * Usage: npx tsx scripts/model-benchmark.ts
 */
import 'dotenv/config';
import { createMistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import * as fs from 'fs';

const API_KEY = process.env.MISTRAL_API_KEY;
if (!API_KEY) {
  console.error('Set MISTRAL_API_KEY');
  process.exit(1);
}

const MODELS = ['mistral-medium-latest', 'mistral-small-latest'] as const;

const SYSTEM_PROMPT = `You are PMSync AI, an intelligent email and productivity assistant. You help users manage emails, calendars, contacts, tasks, and workflows. You can search emails, draft replies, schedule meetings, set reminders, and analyze communication patterns. Be concise but thorough.`;

// Set to 0 to run all, or a number to limit (e.g. 5 for quick test)
const LIMIT = parseInt(process.env.BENCH_LIMIT || '0', 10);

// 50 hard, realistic questions spanning reasoning, email tasks, scheduling,
// summarization, multi-step logic, edge cases, and tool-use decisions.
const ALL_QUESTIONS: string[] = [
  // --- Reasoning & Logic ---
  `I have 3 meetings tomorrow: 9-10am with Alice, 11am-12:30pm with Bob, and 2-3pm with Carol. I need a 45-minute slot to prepare a presentation. When can I fit it in?`,
  `My inbox has 847 unread emails. If I can process 30 emails per hour and I have 2 hours today, 3 hours tomorrow, and 1.5 hours on Friday, will I clear my inbox by the weekend? What's the most efficient triage strategy?`,
  `I got conflicting emails: Marketing says the product launch is April 15, but Engineering says April 22. The CEO's email from last week mentioned "mid-April". Draft a diplomatic email to all three asking for alignment without throwing anyone under the bus.`,
  `Calculate the timezone overlap between a team in Tokyo (UTC+9), London (UTC+0), and San Francisco (UTC-7). What's the best 1-hour meeting window assuming everyone works 9am-6pm local time?`,
  `I need to send a follow-up to a client who hasn't responded in 12 days. The original email was a proposal for $45,000. Draft 3 different follow-up variants: assertive, gentle, and value-add.`,
  // --- Email Drafting & Tone ---
  `Write a professional email declining a job offer from Google. I'm staying at my current company because they matched the offer and I value my team. Keep it gracious and leave the door open.`,
  `Rewrite this angry draft into something professional: "Your team completely dropped the ball on the Q3 deliverables. Nobody seems to care about deadlines anymore. This is the third time this quarter. I'm escalating this to the VP if things don't change immediately."`,
  `Draft an email to my landlord requesting a 3-month rent reduction due to construction noise that's been ongoing for 6 weeks. Reference tenant rights but keep it collaborative.`,
  `I need to apologize to a client for sending them the wrong contract with another client's pricing visible. This is a serious data breach. Draft the apology and outline remediation steps.`,
  `Write an email announcing my resignation to my team. I've been here 4 years, I'm leaving for a startup. Make it warm but not overly emotional.`,
  // --- Complex Summarization ---
  `Summarize this meeting thread into action items with owners and deadlines: "John said the API migration should be done by March 30. Sarah mentioned QA needs 2 weeks after that. Mike pushed back saying we can't start until the database upgrade in April. Lisa volunteered to coordinate but needs budget approval from Tom first. Tom is on vacation until April 5."`,
  `I have 23 emails in a thread about office relocation. Key stakeholders: HR, Facilities, IT, Finance. Create a decision matrix showing who supports which option (downtown vs suburban) and their main concerns.`,
  `Analyze this email chain and tell me: who's blocking progress, what's the actual deadline, and what's the critical path? Thread: PM says EOW, Dev says 2 weeks, QA says they haven't seen specs, Designer says mockups were sent 3 weeks ago but got no feedback.`,
  `Extract all commitments and promises made across these 5 emails from our vendor. Flag any that contradict each other or seem unrealistic given their track record of late deliveries.`,
  `Summarize the key risks mentioned across 40 project update emails into a risk register with likelihood, impact, and suggested mitigations.`,
  // --- Multi-step Task Planning ---
  `I'm organizing a company offsite for 50 people in 6 weeks. Create a comprehensive task list with dependencies, assigned to: me, my assistant, HR, and the venue. Include budget checkpoints.`,
  `Plan the email communication sequence for a product launch: who gets notified first (internal stakeholders, beta users, press, general public), what each email should contain, and timing between each wave.`,
  `I need to migrate our team from Slack to Microsoft Teams. Draft the change management email sequence: announcement, training schedule, FAQ, deadline for transition, and post-migration support.`,
  `Create a 30-60-90 day email outreach plan for a new sales territory. Include templates for cold outreach, follow-ups, and nurture sequences.`,
  `I'm onboarding 5 new hires next Monday. Create the complete email/calendar workflow: welcome emails, calendar invites for orientation sessions, intro emails to their teams, and IT setup reminders.`,
  // --- Calendar & Scheduling Logic ---
  `My calendar shows I'm in 32 hours of meetings this week out of 40 work hours. Analyze which meetings I should decline, delegate, or shorten based on these rules: skip status updates I can read async, delegate anything my direct report can handle, shorten 1-hour meetings that have no agenda to 30 min.`,
  `Find a time for a 6-person meeting across 3 timezones (EST, CET, IST). Two people are part-time (MWF only). One person has a hard stop at 4pm CET daily. Another can't do mornings before 10am EST.`,
  `I double-booked myself: a client demo at 2pm and a board presentation at 2pm. The client meeting was booked first but the board meeting is higher stakes. Draft the rescheduling email for the client with 3 alternative times.`,
  `Create a recurring meeting structure for a team of 8: weekly standup (15 min), biweekly sprint planning (1 hr), monthly retrospective (45 min), and quarterly roadmap review (2 hr). Minimize meeting days.`,
  `I'm traveling to 3 cities next week: NYC (Mon-Tue), Chicago (Wed-Thu), SF (Fri). I have 12 client meetings to schedule. Optimize the schedule considering travel time, jet lag, and meal meetings.`,
  // --- Analysis & Insights ---
  `Analyze my email patterns: I send 45 emails/day, receive 120, average response time is 4.2 hours. 60% are internal, 40% external. My busiest day is Tuesday. What optimizations would you suggest?`,
  `Based on the last quarter's email threads with our top 5 clients, which relationship seems to be cooling off? Look for: decreasing response speed, shorter replies, fewer meeting requests, more formal language.`,
  `Our team's email volume increased 40% this quarter. Help me identify if this is productive communication or just noise. What metrics should I look at?`,
  `Compare the communication styles of my two project managers based on their emails: one sends long detailed updates, the other sends bullet points. Which approach is more effective for our stakeholders who complain about "too many emails"?`,
  `Audit my sent emails from last month for potential compliance issues: any promises of delivery dates, pricing commitments, or scope changes that weren't formally documented in contracts.`,
  // --- Edge Cases & Tricky Requests ---
  `I accidentally sent an internal pricing discussion to our competitor's CEO. It's been 2 minutes. What do I do? Draft the damage control email and outline the legal steps.`,
  `Someone is spoofing my email address and sending phishing emails to my contacts. Draft the warning email to my contact list and explain what SPF/DKIM/DMARC checks they should look for.`,
  `I need to fire someone via email because they work remotely in another country and the timezone difference makes a call impossible for 3 more days. HR says we can't wait. Draft this with legal sensitivity.`,
  `A journalist emailed me asking for comment on a rumored acquisition. I can't confirm or deny. Draft a response that says nothing but sounds cooperative. Also flag this for our PR team.`,
  `I received an email that might be a sophisticated spear-phishing attempt. It references real project names and uses my colleague's writing style but the sender domain is slightly different (john@companly.com vs john@company.com). What should I do?`,
  // --- Technical / Integration ---
  `Explain how email threading works (RFC 5256) and why my replies sometimes start new threads instead of continuing existing ones. What headers matter?`,
  `I want to set up an automated workflow: when I star an email in Gmail, create a task in my project board, set a due date 3 days out, and send me a Telegram reminder the day before. Is this possible with our current integrations?`,
  `Our Microsoft 365 admin changed some settings and now my calendar invites aren't being received by external contacts. What Exchange Online settings should I check?`,
  `Explain the difference between IMAP IDLE and polling for real-time email sync. What are the tradeoffs for battery life, reliability, and latency?`,
  `My email signature renders differently in Outlook, Gmail, and Apple Mail. What HTML/CSS subset is safe to use across all three? Give me a template.`,
  // --- Data Privacy & Compliance ---
  `Draft a GDPR-compliant response to a customer who requested all their data we have in our email system. What categories of data do we need to include?`,
  `Our European office says we can't use our US-hosted email AI features due to data residency requirements. Explain the legal basis and suggest technical solutions.`,
  `Review this email draft for potential violations: it contains a customer's phone number, their child's school name (mentioned casually), and their medical appointment time. Which of these are PII/sensitive data issues?`,
  `Create an email retention policy document: what to keep, what to auto-delete, legal hold procedures, and exception handling. Cover GDPR, CCPA, and SOX requirements.`,
  `A former employee's email alias is still receiving client emails 3 months after departure. What's the correct procedure to handle this from legal, IT, and client communication perspectives?`,
  // --- Strategic & High-level ---
  `Our CEO wants to reduce company-wide email by 30% without losing productivity. Propose a concrete 90-day plan with metrics, tooling changes, and cultural shifts.`,
  `Compare the ROI of investing in email AI triage (auto-categorize, priority scoring) vs hiring an additional executive assistant for our leadership team of 5.`,
  `We're evaluating whether to build custom email integrations or buy a third-party solution. The build estimate is 6 months / 3 engineers. The buy option is $2,400/month. Help me structure the build-vs-buy analysis.`,
  `Draft a board presentation email summarizing our AI email assistant's impact: 23% reduction in response time, 15% fewer missed follow-ups, 8% increase in customer satisfaction. Make the data compelling without overselling.`,
  `Our competitor just launched an AI email feature that auto-drafts replies. Our feature does the same but also learns writing style. Draft the competitive positioning email for our sales team.`,
];

const QUESTIONS = LIMIT > 0 ? ALL_QUESTIONS.slice(0, LIMIT) : ALL_QUESTIONS;

interface BenchResult {
  question: string;
  model: string;
  answer: string;
  ttfbMs: number;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

async function runOne(
  provider: ReturnType<typeof createMistral>,
  model: string,
  question: string,
  idx: number,
): Promise<BenchResult> {
  const t0 = Date.now();
  try {
    const result = await generateText({
      model: provider(model),
      system: SYSTEM_PROMPT,
      prompt: question,
      maxTokens: 800,
      temperature: 0.3,
    });
    const totalMs = Date.now() - t0;
    return {
      question,
      model,
      answer: result.text,
      ttfbMs: totalMs, // generateText doesn't expose TTFB; use total as proxy
      totalMs,
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
    };
  } catch (err: any) {
    return {
      question,
      model,
      answer: '',
      ttfbMs: 0,
      totalMs: Date.now() - t0,
      inputTokens: 0,
      outputTokens: 0,
      error: err.message?.slice(0, 200),
    };
  }
}

// Cost per 1M tokens (March 2026 pricing)
const COSTS: Record<string, { input: number; output: number }> = {
  'mistral-medium-latest': { input: 2.5, output: 7.5 },
  'mistral-small-latest': { input: 0.2, output: 0.6 },
};

async function main() {
  const provider = createMistral({ apiKey: API_KEY! });
  const results: BenchResult[] = [];
  const total = QUESTIONS.length;

  for (const model of MODELS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`MODEL: ${model}`);
    console.log('='.repeat(60));

    for (let i = 0; i < total; i++) {
      const q = QUESTIONS[i];
      const short = q.slice(0, 70).replace(/\n/g, ' ');
      process.stdout.write(`[${i + 1}/${total}] ${short}... `);

      const r = await runOne(provider, model, q, i);
      results.push(r);

      if (r.error) {
        console.log(`ERROR (${r.totalMs}ms): ${r.error.slice(0, 80)}`);
      } else {
        console.log(
          `${r.totalMs}ms | ${r.outputTokens} tok | ${r.answer.length} chars`,
        );
      }

      // Rate-limit: 1 req/s to avoid 429
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  // --- Aggregate stats ---
  console.log('\n\n' + '='.repeat(70));
  console.log('AGGREGATE RESULTS');
  console.log('='.repeat(70));

  for (const model of MODELS) {
    const mr = results.filter((r) => r.model === model && !r.error);
    const errors = results.filter((r) => r.model === model && r.error);
    const avgTime = mr.reduce((s, r) => s + r.totalMs, 0) / mr.length;
    const p50Time = mr.map((r) => r.totalMs).sort((a, b) => a - b)[
      Math.floor(mr.length / 2)
    ];
    const p95Time = mr.map((r) => r.totalMs).sort((a, b) => a - b)[
      Math.floor(mr.length * 0.95)
    ];
    const totalIn = mr.reduce((s, r) => s + r.inputTokens, 0);
    const totalOut = mr.reduce((s, r) => s + r.outputTokens, 0);
    const avgOut = totalOut / mr.length;
    const cost = COSTS[model] || { input: 0, output: 0 };
    const totalCost =
      (totalIn / 1_000_000) * cost.input +
      (totalOut / 1_000_000) * cost.output;
    const avgLen = mr.reduce((s, r) => s + r.answer.length, 0) / mr.length;

    console.log(`\n--- ${model} ---`);
    console.log(`  Success: ${mr.length}/${mr.length + errors.length}`);
    console.log(`  Avg time:  ${avgTime.toFixed(0)}ms`);
    console.log(`  P50 time:  ${p50Time}ms`);
    console.log(`  P95 time:  ${p95Time}ms`);
    console.log(`  Avg output tokens: ${avgOut.toFixed(0)}`);
    console.log(`  Avg answer length: ${avgLen.toFixed(0)} chars`);
    console.log(`  Total input tokens:  ${totalIn}`);
    console.log(`  Total output tokens: ${totalOut}`);
    console.log(`  Estimated cost: $${totalCost.toFixed(4)}`);
    if (errors.length > 0) {
      console.log(`  Errors: ${errors.length}`);
    }
  }

  // --- Side-by-side answer length comparison ---
  console.log('\n\n' + '='.repeat(70));
  console.log('PER-QUESTION COMPARISON (time ms)');
  console.log('='.repeat(70));
  console.log(
    `${'#'.padEnd(4)} ${'Medium'.padEnd(10)} ${'Small-4'.padEnd(10)} ${'Delta'.padEnd(10)} Question`,
  );

  for (let i = 0; i < total; i++) {
    const med = results.find(
      (r) => r.model === 'mistral-medium-latest' && r.question === QUESTIONS[i],
    );
    const sm = results.find(
      (r) =>
        r.model === 'mistral-small-latest' && r.question === QUESTIONS[i],
    );
    const medT = med?.error ? 'ERR' : `${med?.totalMs ?? '?'}`;
    const smT = sm?.error ? 'ERR' : `${sm?.totalMs ?? '?'}`;
    const delta =
      med && sm && !med.error && !sm.error
        ? `${((1 - sm.totalMs / med.totalMs) * 100).toFixed(0)}% faster`
        : '-';
    const short = QUESTIONS[i].slice(0, 50).replace(/\n/g, ' ');
    console.log(
      `${String(i + 1).padEnd(4)} ${medT.padEnd(10)} ${smT.padEnd(10)} ${delta.padEnd(10)} ${short}`,
    );
  }

  // Save full results to JSON
  const outPath = 'scripts/model-benchmark-results.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to ${outPath}`);
}

main().catch(console.error);
