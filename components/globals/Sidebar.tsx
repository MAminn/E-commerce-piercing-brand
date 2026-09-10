import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarTrigger,
} from "#root/components/ui/sidebar";
import { Button } from "#root/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "#root/components/utils/Link";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { formatCategoryName } from "#root/lib/utils";

export function AppSidebar() {
  const [isMenOpen, setIsMenOpen] = useState(false);
  const [isWomenOpen, setIsWomenOpen] = useState(false);

  const [categories, setCategories] = useState<
    {
      label: string;
      to: string;
      type: string;
    }[]
  >([]);

  useEffect(() => {
    trpc.category.view.query().then((res) => {
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      setCategories(
        res.result.map((c) => ({
          label: c.name,
          to: `/featured/${c.type}/categories/${c.id}`,
          type: c.type as string,
        })),
      );
    });
  }, []);

  const menCategories = categories.filter((c) => c.type === "men");

  const womenCategories = categories.filter((c) => c.type === "women");

  return (
    <Sidebar>
      <SidebarHeader>
        <h2 className='text-xl font-semibold p-4'>Categories</h2>
      </SidebarHeader>
      <SidebarContent>
        {/* Men Section */}
        <SidebarGroup>
          <Button
            variant='ghost'
            className='w-full justify-between'
            onClick={() => setIsMenOpen(!isMenOpen)}>
            Men
            {isMenOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </Button>
          {isMenOpen && (
            <div className='pl-4'>
              {menCategories.map((category) => (
                <Link key={category.label} href={category.to}>
                  <Button variant='ghost' className='w-full justify-start'>
                    {formatCategoryName(category.label)}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </SidebarGroup>

        {/* Women Section */}
        <SidebarGroup>
          <Button
            variant='ghost'
            className='w-full justify-between'
            onClick={() => setIsWomenOpen(!isWomenOpen)}>
            Women
            {isWomenOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </Button>
          {isWomenOpen && (
            <div className='pl-4'>
              {womenCategories.map((category) => (
                <Link key={category.label} href={category.to}>
                  <Button variant='ghost' className='w-full justify-start'>
                    {formatCategoryName(category.label)}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarTrigger className=' w-[95%] flex justify-end'>
        <Button variant='ghost' className='w-full justify-end'>
          Close
        </Button>
      </SidebarTrigger>
    </Sidebar>
  );
}
