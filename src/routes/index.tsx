import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fundsroom ERP · Operations Portal" },
      {
        name: "description",
        content:
          "Internal ERP and CRM portal for wholesale distribution: customers, products, inventory and sales challans.",
      },
      { property: "og:title", content: "Fundsroom ERP · Operations Portal" },
      {
        property: "og:description",
        content: "Customers, inventory and transactional sales challan workflow in one portal.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
