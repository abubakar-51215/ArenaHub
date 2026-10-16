// Frame 14 of arena-hub-player-app-google.html: after "Use a different email" the sign-up password stays in the screen's
// memory (hidden, never shown), is sent again by Continue, and is never stored, logged or passed to another screen.
// The browser version of this check (it types a password, goes round the loop and looks at storage) runs with the
// integration scripts; this one guards the source. Run: node scripts/signup-password-check.cjs
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const reg = read('app/(auth)/register.tsx');
const otp = read('app/(auth)/verify-otp.tsx');
let failed = 0;
const must = (name, ok) => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
};
must('the password is kept in the sign-up screen\'s own state', /const \[password, setPassword\] = useState\(''\)/.test(reg));
must('while only the email changes the password field is hidden, not removed (display: none)', /codeSent && styles\.hidden/.test(reg) && /hidden:\s*\{\s*display:\s*'none'\s*\}/.test(reg));
must('Continue sends the kept password again', /register\(\{[^}]*password[^}]*\}\)/.test(reg));
must('the password rules list is not drawn in that state', /codeSent \? null : <PasswordRules/.test(reg));
must('the password is not put in the route params of the code screen', !/params:\s*\{[^}]*password/.test(reg));
must('the sign-up screen does not touch storage or logs', !/SecureStore|AsyncStorage|localStorage|sessionStorage|console\./.test(reg));
must('the code screen never receives or shows a password', !/password/i.test(otp.replace(/Forgot password/g, '')));
console.log(failed ? `${failed} sign-up password checks failed` : 'all sign-up password checks passed');
process.exit(failed ? 1 : 0);
