import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FileText, Settings, Users } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { useUserRole } from "@/hooks/useUserRole";

export const Navigation = () => {
  const location = useLocation();
  const { data: userRole } = useUserRole();

  const links = [
    { to: "/", label: "Dashboard", icon: FileText, showAlways: true },
    { to: "/team", label: "Team", icon: Users, adminOnly: true },
    { to: "/settings", label: "Settings", icon: Settings, showAlways: true },
  ];

  const visibleLinks = links.filter(link => 
    link.showAlways || (link.adminOnly && userRole?.isAdmin)
  );

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-14">
          <div className="flex gap-6">
            {visibleLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 px-3 border-b-2 transition-colors",
                  location.pathname === to
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
          <UserMenu />
        </div>
      </div>
    </nav>
  );
};
