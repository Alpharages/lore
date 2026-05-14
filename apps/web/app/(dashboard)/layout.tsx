import AppSidebar from "@/components/app/app-sidebar";
import TopBar from "@/components/app/top-bar";
import { ProjectProvider } from "@/hooks/use-project";
import { ProjectInvalidator } from "@/components/app/project-invalidator";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ProjectProvider>
      <ProjectInvalidator />
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main id="main-content" className="flex-1 overflow-auto">
            <div className="max-w-[1280px] mx-auto px-6 py-6">{children}</div>
          </main>
        </div>
      </div>
    </ProjectProvider>
  );
};

export default DashboardLayout;
