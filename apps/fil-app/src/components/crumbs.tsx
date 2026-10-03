import { Link, useLocation } from '@tanstack/react-router'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { crumbsFor } from '@/lib/crumbs'
import { cn } from '@/lib/utils'

/**
 * Breadcrumbs for the current page, derived from its path. Renders
 * nothing on home pages.
 *
 * @param props.className - Extra classes.
 * @see https://ui.shadcn.com/docs/components/base/breadcrumb
 */
export function Crumbs(props: { className?: string }) {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)
  if (crumbs.length === 0) {
    return null
  }
  return (
    <Breadcrumb className={cn('min-w-0', props.className)}>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.label}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {crumb.href ? (
                <BreadcrumbLink render={<Link to={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">
                  {crumb.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
