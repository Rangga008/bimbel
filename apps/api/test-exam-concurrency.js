/**
 * Testing script untuk Fase 3c - Exam Core & Timing
 * Simulasi 3 attempt bersamaan untuk verifikasi auto-submit & concurrency
 * 
 * Usage:
 * 1. Buat exam dulu via API (POST /api/exams)
 * 2. Set scheduledStartAt = now + 1 menit, scheduledEndAt = now + 2 menit
 * 3. Jalankan script ini dengan examId yang dibuat
 * 4. Script akan membuat 3 attempt dari 3 siswa berbeda secara bersamaan
 * 5. Tunggu sampai scheduledEnd_at tercapai (2 menit)
 * 6. Verifikasi semua 3 attempt otomatis di-submit di waktu yang sama
 */

const EXAM_ID = process.env.EXAM_ID || '';
const API_BASE = 'http://localhost:3000/api';

// 3 akun siswa untuk testing
const STUDENTS = [
  { email: 'siswa1@bimbel.test', password: 'Siswa123!' },
  { email: 'siswa2@bimbel.test', password: 'Siswa123!' },
  { email: 'siswa3@bimbel.test', password: 'Siswa123!' },
];

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email}`);
  }

  const data = await res.json();
  return data.accessToken;
}

async function startExam(token, examId) {
  const res = await fetch(`${API_BASE}/exam-attempts/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ examId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Start exam failed: ${error.message}`);
  }

  return res.json();
}

async function saveAnswer(token, attemptId, questionId, answer) {
  const res = await fetch(`${API_BASE}/exam-attempts/${attemptId}/answers/${questionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(answer),
  });

  if (!res.ok) {
    console.error(`Save answer failed for attempt ${attemptId}`);
  }
}

async function getAttemptDetail(token, attemptId) {
  const res = await fetch(`${API_BASE}/exam-attempts/${attemptId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error('Get attempt detail failed');
  }

  return res.json();
}

async function main() {
  if (!EXAM_ID) {
    console.error('EXAM_ID environment variable is required');
    console.log('Usage: EXAM_ID=<exam_id> node test-exam-concurrency.js');
    process.exit(1);
  }

  console.log('=== Fase 3c Concurrency Test ===');
  console.log(`Exam ID: ${EXAM_ID}`);
  console.log('Starting concurrent test with 3 students...\n');

  try {
    // Login semua siswa
    console.log('Step 1: Logging in students...');
    const tokens = await Promise.all(
      STUDENTS.map(async (student) => {
        const token = await login(student.email, student.password);
        console.log(`✓ Logged in: ${student.email}`);
        return token;
      })
    );

    // Start exam secara bersamaan (concurrent)
    console.log('\nStep 2: Starting exam attempts concurrently...');
    const startTime = Date.now();
    const attempts = await Promise.all(
      tokens.map(async (token, index) => {
        const attempt = await startExam(token, EXAM_ID);
        console.log(`✓ Attempt ${index + 1} started: ${attempt.id}`);
        return { token, attempt, index };
      })
    );
    const endTime = Date.now();
    console.log(`All attempts started in ${endTime - startTime}ms\n`);

    // Simulasikan jawaban (save answer) secara bersamaan
    console.log('Step 3: Saving answers concurrently...');
    const questionId = attempts[0].attempt.items[0]?.questionId;
    if (questionId) {
      await Promise.all(
        attempts.map(async ({ token, attempt, index }) => {
          await saveAnswer(token, attempt.id, questionId, {
            selectedOptionIds: [attempt.items[0].question.options[0]?.id],
          });
          console.log(`✓ Answer saved for attempt ${index + 1}`);
        })
      );
    }

    // Tunggu scheduled_end_at (harus manual untuk testing)
    console.log('\nStep 4: Waiting for scheduled_end_at...');
    console.log('Please wait for the exam to end (check scheduled_end_at)');
    console.log('Then press Enter to check if all attempts were auto-submitted...');
    
    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

    // Cek status semua attempt
    console.log('\nStep 5: Checking attempt status after auto-submit...');
    const results = await Promise.all(
      attempts.map(async ({ token, attempt, index }) => {
        const detail = await getAttemptDetail(token, attempt.id);
        console.log(`Attempt ${index + 1}:`);
        console.log(`  Status: ${detail.status}`);
        console.log(`  Submitted At: ${detail.submittedAt}`);
        console.log(`  Score: ${detail.score}/${detail.maxScore}`);
        console.log(`  Late By: ${detail.lateByMs}ms`);
        return detail;
      })
    );

    // Verifikasi
    console.log('\n=== Verification Results ===');
    const allSubmitted = results.every(r => r.status === 'SUBMITTED');
    const submissionTimes = results.map(r => new Date(r.submittedAt).getTime());
    const maxTimeDiff = Math.max(...submissionTimes) - Math.min(...submissionTimes);

    console.log(`All attempts submitted: ${allSubmitted ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Max time difference between submissions: ${maxTimeDiff}ms`);
    console.log(`Expected: < 10000ms (10 seconds)`);
    
    if (allSubmitted && maxTimeDiff < 10000) {
      console.log('\n✓✓✓ AUTO-SUBMIT & CONCURRENCY TEST PASSED ✓✓✓');
    } else {
      console.log('\n✗✗✗ AUTO-SUBMIT & CONCURRENCY TEST FAILED ✗✗✗');
    }

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
