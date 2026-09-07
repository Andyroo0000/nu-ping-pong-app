import { Suspense } from "react";
import { LogMatchForm } from "./LogMatchForm";

export default function LogMatchPage() {
  return (
    <Suspense fallback={null}>
      <LogMatchForm />
    </Suspense>
  );
}
