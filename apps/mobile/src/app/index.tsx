import { Redirect } from 'expo-router';

// Root entry: send "/" to the default tab. Tabs are named (bonetider/
// installningar/om), so there's no `index` route inside (tabs) — this leaf
// provides the "/" route the dev client opens.
export default function Index() {
  return <Redirect href="/bonetider" />;
}
