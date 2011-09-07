from setuptools import setup, find_packages
import sys, os

version = '0.4.1'

setup(name='webapp',
      version=version,
      description="AJAX-y REST-y stuff for a webapp",
      long_description="""\
""",
      classifiers=[], # Get strings from http://pypi.python.org/pypi?%3Aaction=list_classifiers
      keywords='',
      author='Mooball IT',
      author_email='sergey@mooball.com',
      url='http://www.mooball.com',
      license='',
      packages=find_packages(exclude=['ez_setup', 'examples', 'tests']),
      include_package_data=True,
      zip_safe=False,
      install_requires=[
          # -*- Extra requirements: -*-
          'crud',
      ],
      entry_points="""
      # -*- Entry points: -*-
      """,
      )
