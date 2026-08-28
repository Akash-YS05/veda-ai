"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Redirecting to Veda AI Question-Answer Mapper...</p>
    </div>
  );
}