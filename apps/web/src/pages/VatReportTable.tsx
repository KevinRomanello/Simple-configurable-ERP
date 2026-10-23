import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { api } from "../api/client";
import { date, money } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";

/** The VAT the team has to pay on each quarterly deadline, per project (the old "VAT OUTFLOW / PROJECT"). */
export function VatReportTable({ areaCode }: { areaCode: string }) {
  const report = useQuery({ queryKey: ["vat-report", areaCode], queryFn: () => api.vatReport(areaCode) });
  if (!report.data) return null;
  const { deadlines, projects } = report.data;

  return (
    <section className="panel">
      <h2>VAT OUTFLOW / PROJECT</h2>
      <TableBox title="VAT OUTFLOW / PROJECT">
        <table className="data-table">
          <thead>
            <tr>
              <th>PROJECT</th>
              <th />
              {deadlines.map((d) => (
                <th key={d} className="num">{date(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <Fragment key={project.id}>
                <tr>
                  <td className="bold" rowSpan={2}>{project.name}</td>
                  <td>EXPECTED</td>
                  {project.estimateCents.map((c, i) => (
                    <td key={deadlines[i]} className="num">{money(c, true)}</td>
                  ))}
                </tr>
                <tr>
                  <td>ACTUAL</td>
                  {project.actualCents.map((c, i) => (
                    <td key={deadlines[i]} className="num">{money(c, true)}</td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}
