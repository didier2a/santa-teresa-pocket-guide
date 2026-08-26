await import('../../pg22/bootstrap/app.js');
const {installLivingCompanion}=await import('./living-companion-runtime.js');
installLivingCompanion();
