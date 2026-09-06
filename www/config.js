// Public client configuration. The publishable key is safe to ship: it only
// grants what Row Level Security allows. Never put the service_role key here.
window.SCRAPPY_CONFIG = {
  supabaseUrl: 'https://wbfloxbqeykiwtnzruiu.supabase.co',
  supabaseKey: 'sb_publishable_k17YWobxzPYWn5fowduCZQ_68Hauxna',
  // Deep link the app registers for OAuth and email-confirmation returns.
  nativeRedirect: 'scrappybird://auth',
};
