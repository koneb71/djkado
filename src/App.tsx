import { AppShell } from './components/layout/AppShell';
import { MobileShell } from './components/mobile/MobileShell';
import { useIsMobile } from './mobile/useIsMobile';

export default function App() {
  const mobile = useIsMobile();
  return mobile ? <MobileShell /> : <AppShell />;
}
