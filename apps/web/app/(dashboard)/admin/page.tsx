import { AdminProjectsTable } from "@/components/app/admin-projects-table";

const AdminPage = () => {
  return (
    <main id="main-content">
      <h1 className="mb-6 text-xl font-semibold text-foreground">Admin</h1>
      <AdminProjectsTable />
    </main>
  );
};

export default AdminPage;
