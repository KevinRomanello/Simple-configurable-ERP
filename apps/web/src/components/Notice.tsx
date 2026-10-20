import { faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Notice {
  id: number;
  kind: "error" | "info";
  message: string;
}

const NoticeContext = createContext<(kind: Notice["kind"], message: string) => void>(() => {});

/** Shows short messages in the corner (a refused save, a conflict) and clears them after a while. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  const notify = useCallback((kind: Notice["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setNotices((current) => [...current, { id, kind, message }]);
    setTimeout(() => setNotices((current) => current.filter((n) => n.id !== id)), 7000);
  }, []);

  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div className="notice-stack" role="status" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice ${n.kind}`}>
            <FontAwesomeIcon icon={n.kind === "error" ? faTriangleExclamation : faCircleInfo} />
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}

export const useNotify = () => useContext(NoticeContext);
