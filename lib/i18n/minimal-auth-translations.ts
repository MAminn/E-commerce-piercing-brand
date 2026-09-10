/**
 * Standalone EN/AR translations for the Minimal template auth pages.
 * No CMS dependency — just import and use with locale.
 */

export const minimalAuthT = {
  en: {
    // Login
    "login.title": "Welcome back",
    "login.subtitle": "Sign in to your account",
    "login.email": "Email",
    "login.email_placeholder": "your@email.com",
    "login.password": "Password",
    "login.password_placeholder": "Enter password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in...",
    "login.forgot_password": "Forgot password?",
    "login.no_account": "Don't have an account?",
    "login.create_account": "Create an account",

    // Register
    "register.title": "Create account",
    "register.subtitle": "Join us — it only takes a moment",
    "register.name": "Full name",
    "register.name_placeholder": "Jane Doe",
    "register.email": "Email",
    "register.email_placeholder": "your@email.com",
    "register.phone": "Phone",
    "register.phone_placeholder": "+201xxxxxxxxx",
    "register.password": "Password",
    "register.password_placeholder": "Min. 8 characters",
    "register.confirm_password": "Confirm password",
    "register.confirm_password_placeholder": "Repeat password",
    "register.submit": "Create account",
    "register.submitting": "Creating account...",
    "register.has_account": "Already have an account?",
    "register.sign_in": "Sign in instead",
    "register.success_title": "You're all set",
    "register.success_message":
      "Please check your email to verify your account. Once verified, you can log in.",
    "register.go_to_login": "Go to login",

    // Forgot Password
    "forgot.title": "Forgot password?",
    "forgot.subtitle": "Enter your email and we'll send you a reset link",
    "forgot.email": "Email",
    "forgot.email_placeholder": "your@email.com",
    "forgot.submit": "Send reset link",
    "forgot.submitting": "Sending...",
    "forgot.back_to_login": "Back to login",
    "forgot.success_title": "Check your email",
    "forgot.success_message":
      "If an account exists with that email, we've sent a password reset link. Please check your inbox.",
  },
  ar: {
    // Login
    "login.title": "مرحباً بعودتك",
    "login.subtitle": "تسجيل الدخول إلى حسابك",
    "login.email": "البريد الإلكتروني",
    "login.email_placeholder": "بريدك@email.com",
    "login.password": "كلمة المرور",
    "login.password_placeholder": "أدخل كلمة المرور",
    "login.submit": "تسجيل الدخول",
    "login.submitting": "جارٍ تسجيل الدخول...",
    "login.forgot_password": "نسيت كلمة المرور؟",
    "login.no_account": "ليس لديك حساب؟",
    "login.create_account": "إنشاء حساب",

    // Register
    "register.title": "إنشاء حساب",
    "register.subtitle": "انضم إلينا — لن يستغرق الأمر سوى لحظة",
    "register.name": "الاسم الكامل",
    "register.name_placeholder": "الاسم الكامل",
    "register.email": "البريد الإلكتروني",
    "register.email_placeholder": "بريدك@email.com",
    "register.phone": "رقم الهاتف",
    "register.phone_placeholder": "+201xxxxxxxxx",
    "register.password": "كلمة المرور",
    "register.password_placeholder": "٨ أحرف على الأقل",
    "register.confirm_password": "تأكيد كلمة المرور",
    "register.confirm_password_placeholder": "أعد كتابة كلمة المرور",
    "register.submit": "إنشاء حساب",
    "register.submitting": "جارٍ إنشاء الحساب...",
    "register.has_account": "لديك حساب بالفعل؟",
    "register.sign_in": "تسجيل الدخول",
    "register.success_title": "تم بنجاح",
    "register.success_message":
      "يرجى التحقق من بريدك الإلكتروني لتأكيد حسابك. بعد التأكيد يمكنك تسجيل الدخول.",
    "register.go_to_login": "الذهاب لتسجيل الدخول",

    // Forgot Password
    "forgot.title": "نسيت كلمة المرور؟",
    "forgot.subtitle": "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين",
    "forgot.email": "البريد الإلكتروني",
    "forgot.email_placeholder": "بريدك@email.com",
    "forgot.submit": "إرسال رابط إعادة التعيين",
    "forgot.submitting": "جارٍ الإرسال...",
    "forgot.back_to_login": "العودة لتسجيل الدخول",
    "forgot.success_title": "تحقق من بريدك الإلكتروني",
    "forgot.success_message":
      "إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، فقد أرسلنا رابط إعادة تعيين كلمة المرور.",
  },
} as const;

export type MinimalAuthKey = keyof (typeof minimalAuthT)["en"];
