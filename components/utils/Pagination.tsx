import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "#root/components/ui/button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const isPrevDisabled = currentPage === 1;
  const isNextDisabled = currentPage === totalPages;

  const handlePrev = () => {
    if (!isPrevDisabled) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (!isNextDisabled) {
      onPageChange(currentPage + 1);
    }
  };

  // Generate page numbers to display (current, previous 2, next 2)
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    // If we have 5 or fewer pages, show all
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // Always include current page
    pages.push(currentPage);

    // Add pages before current
    for (let i = 1; i <= 2; i++) {
      if (currentPage - i > 0) {
        pages.unshift(currentPage - i);
      }
    }

    // Add pages after current
    for (let i = 1; i <= 2; i++) {
      if (currentPage + i <= totalPages) {
        pages.push(currentPage + i);
      }
    }

    // If we have less than maxPagesToShow, add more pages to beginning or end
    while (pages.length < maxPagesToShow && pages.length > 0) {
      const first = pages[0];
      const last = pages[pages.length - 1];

      if (first && first > 1) {
        pages.unshift(first - 1);
      } else if (last && last < totalPages) {
        pages.push(last + 1);
      } else {
        break;
      }
    }

    return pages;
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className='flex items-center justify-center space-x-2'>
      <Button
        variant='outline'
        size='icon'
        onClick={handlePrev}
        disabled={isPrevDisabled}
        aria-label='Previous page'>
        <ChevronLeft className='h-4 w-4' />
      </Button>

      {getPageNumbers().map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? "primary" : "outline"}
          size='sm'
          onClick={() => onPageChange(page)}
          disabled={page === currentPage}
          className={
            page === currentPage ? "bg-accent-lb hover:bg-accent-lb/90" : ""
          }>
          {page}
        </Button>
      ))}

      <Button
        variant='outline'
        size='icon'
        onClick={handleNext}
        disabled={isNextDisabled}
        aria-label='Next page'>
        <ChevronRight className='h-4 w-4' />
      </Button>
    </div>
  );
}
