import { getNavSummary } from "@/lib/nav-summary";
import { BottomTabsBar } from "@/components/BottomTabsBar";

/**
 * Phone navigation. The top nav hides its section links below `sm`, which
 * left matchmaking — the main thing the app is for — with no route to it at
 * all on a phone. A bottom bar also puts the tabs in the thumb zone and is
 * what makes the installed app feel like an app rather than a page.
 */
export async function BottomTabs() {
  const { username, unread, pendingChallenges } = await getNavSummary();
  return (
    <BottomTabsBar username={username} unread={unread} challenges={pendingChallenges} />
  );
}
